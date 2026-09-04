//! The fan-out: one `ltk_meta::walk::Visitor` driving every instance of one
//! bin through one walk, each pruned on its own.
//!
//! The traversal rules are `docs/design/problems-pass.md` section 6.1. The
//! walk enters what any active instance wants and calls each only where that
//! instance wanted to be, so a prune tuned to one visitor never starves
//! another (D7).

use ltk_hash::BinHash;
use ltk_meta::walk::{Node, TreeValue, Visit, Visitor};

use super::{Sink, Walk};

/// A set of instances, one bit each.
type Set = u64;

/// The most instances one bin can carry.
const MOST: usize = Set::BITS as usize;

pub(super) struct Fan<'r, 'f> {
    instances: Vec<Box<dyn Walk<'f> + 'r>>,
    /// The active set of each open scope, innermost last: a node's, then each
    /// entered property's beneath it.
    scopes: Vec<Set>,
    /// Instances that answered `Stop` or `Abort`, out of every set for the
    /// rest of the bin. No exit reaches one.
    stopped: Set,
}

/// What a set of instances answered.
struct Asked {
    continued: Set,
    skipped: Set,
}

impl<'r, 'f> Fan<'r, 'f> {
    /// # Panics
    ///
    /// On more instances than a set holds, which is a bug in the plan: a run
    /// has one instance per bin subscription and per demanded fact.
    pub(super) fn new(instances: Vec<Box<dyn Walk<'f> + 'r>>) -> Self {
        assert!(
            instances.len() <= MOST,
            "a bin carries at most {MOST} instances, not {}",
            instances.len()
        );
        Self {
            instances,
            scopes: Vec::new(),
            stopped: 0,
        }
    }

    /// Every instance's sink back, in registration order, after `end` on each.
    pub(super) fn end(self) -> Vec<Sink<'f>> {
        self.instances.into_iter().map(Walk::end).collect()
    }

    fn all(&self) -> Set {
        if self.instances.len() == MOST {
            Set::MAX
        } else {
            (1 << self.instances.len()) - 1
        }
    }

    /// The set a callback reaches: the innermost open scope, or every instance
    /// at an object's root.
    fn active(&self) -> Set {
        self.scopes.last().copied().unwrap_or_else(|| self.all()) & !self.stopped
    }

    /// What the walk is told for a scope holding `set`.
    fn answer(&self, set: Set) -> Visit {
        if self.stopped == self.all() {
            Visit::Stop
        } else if set & !self.stopped == 0 {
            Visit::Skip
        } else {
            Visit::Continue
        }
    }

    /// Ask each instance in `set`, in registration order.
    fn ask(
        &mut self,
        set: Set,
        mut call: impl FnMut(&mut (dyn Walk<'f> + 'r)) -> Result<Visit, ltk_meta::Error>,
    ) -> Result<Asked, ltk_meta::Error> {
        let Self {
            instances, stopped, ..
        } = self;
        let mut asked = Asked {
            continued: 0,
            skipped: 0,
        };
        for (index, instance) in instances.iter_mut().enumerate() {
            let bit = 1 << index;
            if set & bit == 0 {
                continue;
            }
            match call(&mut **instance)? {
                Visit::Continue => asked.continued |= bit,
                Visit::Skip => asked.skipped |= bit,
                Visit::Stop | Visit::Abort => *stopped |= bit,
            }
        }
        Ok(asked)
    }

    fn enter_node_with(
        &mut self,
        call: impl FnMut(&mut (dyn Walk<'f> + 'r)) -> Result<Visit, ltk_meta::Error>,
    ) -> Result<Visit, ltk_meta::Error> {
        let asked = self.active();
        let Asked { continued, .. } = self.ask(asked, call)?;
        self.scopes.push(continued);
        Ok(self.answer(continued))
    }

    /// Reaches every instance asked at the node's entry. An instance's `Skip`
    /// prunes the enclosing property's remaining items for that instance
    /// alone.
    fn exit_node_with(
        &mut self,
        call: impl FnMut(&mut (dyn Walk<'f> + 'r)) -> Result<Visit, ltk_meta::Error>,
    ) -> Result<Visit, ltk_meta::Error> {
        self.scopes.pop();
        let asked = self.active();
        let Asked { skipped, .. } = self.ask(asked, call)?;
        match self.scopes.last_mut() {
            Some(enclosing) => {
                *enclosing &= !skipped;
                let remaining = *enclosing;
                Ok(self.answer(remaining))
            }
            // The root: nothing encloses it, and the walk moves on regardless.
            None => Ok(self.answer(self.all())),
        }
    }

    fn enter_property_with(
        &mut self,
        holds_node: bool,
        call: impl FnMut(&mut (dyn Walk<'f> + 'r)) -> Result<Visit, ltk_meta::Error>,
    ) -> Result<Visit, ltk_meta::Error> {
        let asked = self.active();
        let Asked { continued, .. } = self.ask(asked, call)?;
        if holds_node {
            // Exited symmetrically (W8), which is what pops it.
            self.scopes.push(continued);
            Ok(self.answer(continued))
        } else {
            Ok(self.answer(self.all()))
        }
    }

    /// Reaches every instance asked at the property's entry. An instance's
    /// `Skip` prunes the node's remaining properties for that instance alone.
    fn exit_property_with(
        &mut self,
        call: impl FnMut(&mut (dyn Walk<'f> + 'r)) -> Result<Visit, ltk_meta::Error>,
    ) -> Result<Visit, ltk_meta::Error> {
        self.scopes.pop();
        let asked = self.active();
        let Asked { skipped, .. } = self.ask(asked, call)?;
        if let Some(node) = self.scopes.last_mut() {
            *node &= !skipped;
        }
        let remaining = self.active();
        Ok(self.answer(remaining))
    }
}

impl<'a, 'r, 'f, V: TreeValue<'a>> Visitor<'a, V> for Fan<'r, 'f>
where
    dyn Walk<'f> + 'r: Visitor<'a, V, Error = ltk_meta::Error>,
{
    type Error = ltk_meta::Error;

    fn enter_node(&mut self, node: &Node<'_, 'a, V>) -> Result<Visit, ltk_meta::Error> {
        self.enter_node_with(|walk| walk.enter_node(node))
    }

    fn exit_node(&mut self, node: &Node<'_, 'a, V>) -> Result<Visit, ltk_meta::Error> {
        self.exit_node_with(|walk| walk.exit_node(node))
    }

    fn enter_property(
        &mut self,
        field: BinHash,
        value: V,
        node: &Node<'_, 'a, V>,
    ) -> Result<Visit, ltk_meta::Error> {
        // The tree's answer, asked before any instance (W1, W7).
        let holds_node = value.holds_node()?;
        self.enter_property_with(holds_node, |walk| walk.enter_property(field, value, node))
    }

    fn exit_property(
        &mut self,
        field: BinHash,
        value: V,
        node: &Node<'_, 'a, V>,
    ) -> Result<Visit, ltk_meta::Error> {
        self.exit_property_with(|walk| walk.exit_property(field, value, node))
    }
}
