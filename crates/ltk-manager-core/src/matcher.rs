//! What a search query is, and what it matches.
//!
//! [`Query`] is plain substring matching, and the twin of
//! `src/modules/workshop/palette/matcher.ts`. The two must agree on order, so
//! `ranking.fixture.json` is checked by both suites. Change one and the
//! other's fixture test fails.
//!
//! A query is split on whitespace and every term has to appear, which is the
//! search a file manager does and the one a modder expects. Subsequence
//! matching was the first attempt and it is the wrong default here: `nasus` has
//! its five letters in order inside nearly every long asset path, so it matched
//! 137,032 files of a live install and buried the four that were wanted.
//!
//! [`FindQuery`] is the full search's pattern. It has no frontend twin,
//! because the backend is its only scorer.

use std::borrow::Cow;

use regex::{Regex, RegexBuilder};

/// A term beginning at a word boundary, which is where a name starts.
const BOUNDARY_BONUS: f64 = 1.0;
/// A term that is a whole word, rather than a run inside one.
const WHOLE_WORD_BONUS: f64 = 0.5;
/// What a term is worth before either bonus.
const TERM_SCORE: f64 = 1.0;
/// What one term scores on a name that is exactly that term.
pub const EXACT_SCORE: f64 = TERM_SCORE + BOUNDARY_BONUS + WHOLE_WORD_BONUS;

/// A half-open run of matched bytes, as `[start, end)`.
pub type Range = (u32, u32);

/// One matched candidate, with the runs a row marks.
#[derive(Debug, Clone, PartialEq)]
pub struct Match {
    pub score: f64,
    pub ranges: Vec<Range>,
}

/// A query, split into the terms a candidate has to hold all of.
///
/// Built once per search and read against every candidate, so the split and the
/// lowercasing are paid for once rather than once per row.
#[derive(Debug, Clone)]
pub struct Query {
    terms: Vec<Box<str>>,
    mask: u32,
}

impl Query {
    /// Split `raw` into its terms, or report that it asks for nothing.
    #[must_use]
    pub fn parse(raw: &str) -> Option<Self> {
        let terms: Vec<Box<str>> = raw
            .split_whitespace()
            .map(|term| term.to_ascii_lowercase().into_boxed_str())
            .collect();
        if terms.is_empty() {
            return None;
        }

        let mask = terms.iter().fold(0, |mask, term| mask | letter_mask(term));
        Some(Self { terms, mask })
    }

    /// The letters every term holds together, for the candidate mask to cover.
    #[must_use]
    pub fn mask(&self) -> u32 {
        self.mask
    }

    /// How many characters the query asks for, ignoring the gaps between terms.
    #[must_use]
    pub fn len(&self) -> usize {
        self.terms.iter().map(|term| term.len()).sum()
    }

    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.terms.is_empty()
    }

    /// Whether `text` opens with the query's first term.
    ///
    /// What separates a name a query names from a name that merely holds it.
    #[must_use]
    pub fn starts(&self, text: &str) -> bool {
        self.terms
            .first()
            .is_some_and(|term| find(text.as_bytes(), term.as_bytes(), 0) == Some(0))
    }

    /// Score `text`, or report that it does not hold every term.
    ///
    /// Compared case-insensitively as ASCII, because a resolved WAD path is
    /// ASCII by construction. A candidate that is not gives up its marked runs
    /// rather than handing back offsets that would split a character.
    #[must_use]
    pub fn matches(&self, text: &str) -> Option<Match> {
        let bytes = text.as_bytes();
        let mut score = 0.0;
        let mut ranges = Vec::with_capacity(self.terms.len());

        for term in &self.terms {
            let at = best_occurrence(bytes, term.as_bytes())?;
            let end = at + term.len();

            score += TERM_SCORE;
            if starts_word(bytes, at) {
                score += BOUNDARY_BONUS;
                if ends_word(bytes, end) {
                    score += WHOLE_WORD_BONUS;
                }
            }
            ranges.push((at as u32, end as u32));
        }

        if !text.is_ascii() {
            ranges.clear();
        }
        Some(Match {
            score,
            ranges: merge(ranges),
        })
    }
}

/// How a full-search pattern reads: as the characters themselves, or as a regex.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum PatternSyntax {
    /// The pattern is the characters themselves, metacharacters included.
    Literal,
    /// The pattern is a regular expression, in the `regex` crate's syntax.
    Regex,
}

/// A full-search pattern, compiled once and read against every candidate.
///
/// Always case-insensitive. A resolved WAD path is lowercase by construction,
/// so a case toggle would only teach a pattern to miss. Where [`Query`] ranks
/// a bounded best-of for the palette, this answers yes or no for the full
/// search, which reports everything it holds.
#[derive(Debug, Clone)]
pub struct FindQuery {
    regex: Regex,
}

impl FindQuery {
    /// Compile `pattern`, or report that it asks for nothing.
    ///
    /// # Errors
    ///
    /// Fails when `syntax` is [`PatternSyntax::Regex`] and `pattern` does not
    /// parse as one. A literal always compiles, because it is escaped first.
    pub fn parse(pattern: &str, syntax: PatternSyntax) -> Result<Option<Self>, regex::Error> {
        if pattern.is_empty() {
            return Ok(None);
        }

        let source = match syntax {
            PatternSyntax::Literal => Cow::Owned(regex::escape(pattern)),
            PatternSyntax::Regex => Cow::Borrowed(pattern),
        };
        let regex = RegexBuilder::new(&source).case_insensitive(true).build()?;
        Ok(Some(Self { regex }))
    }

    /// The runs the pattern matches in `text`, or `None` where it has no hit.
    ///
    /// Empty runs are dropped rather than kept: a pattern like `x*` matches
    /// the empty string everywhere, and a row marked nowhere is not a result.
    /// A candidate that is not ASCII gives up its marked runs rather than
    /// handing back offsets that would split a character.
    #[must_use]
    pub fn matches(&self, text: &str) -> Option<Vec<Range>> {
        let mut runs = self
            .regex
            .find_iter(text)
            .filter(|found| found.start() < found.end())
            .map(|found| (found.start() as u32, found.end() as u32));

        let first = runs.next()?;
        if !text.is_ascii() {
            return Some(Vec::new());
        }
        Some(std::iter::once(first).chain(runs).collect())
    }
}

/// Where a term is best read: at a word boundary, or failing that at all.
///
/// A boundary is what a reader's eye lands on, so `base` in `.../base/skin.bin`
/// beats the `base` buried inside `databases.bin`.
fn best_occurrence(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    let first = find(haystack, needle, 0)?;
    if starts_word(haystack, first) {
        return Some(first);
    }

    let mut at = first;
    while let Some(next) = find(haystack, needle, at + 1) {
        if starts_word(haystack, next) {
            return Some(next);
        }
        at = next;
    }
    Some(first)
}

/// The first index at or after `from` where `needle` sits, ignoring ASCII case.
///
/// `needle` is expected already lowercased, which is what lets a query be
/// lowercased once rather than once per candidate.
fn find(haystack: &[u8], needle: &[u8], from: usize) -> Option<usize> {
    if needle.is_empty() || needle.len() > haystack.len() {
        return None;
    }

    (from..=haystack.len() - needle.len()).find(|&start| {
        haystack[start..start + needle.len()]
            .iter()
            .zip(needle)
            .all(|(byte, wanted)| byte.to_ascii_lowercase() == *wanted)
    })
}

/// Whether `at` opens a word: the start, after a separator, or a capital.
fn starts_word(text: &[u8], at: usize) -> bool {
    if at == 0 {
        return true;
    }
    let previous = text[at - 1];
    if matches!(previous, b'/' | b'\\' | b'_' | b'-' | b'.' | b' ') {
        return true;
    }
    !previous.is_ascii_uppercase() && text[at].is_ascii_uppercase()
}

/// Whether `at` closes a word: the end, or the character after it separates.
fn ends_word(text: &[u8], at: usize) -> bool {
    at == text.len() || matches!(text[at], b'/' | b'\\' | b'_' | b'-' | b'.' | b' ')
}

/// Sort the runs and fold any that touch, so a row marks each character once.
fn merge(mut ranges: Vec<Range>) -> Vec<Range> {
    if ranges.len() < 2 {
        return ranges;
    }
    ranges.sort_unstable();

    let mut merged: Vec<Range> = Vec::with_capacity(ranges.len());
    for (start, end) in ranges {
        match merged.last_mut() {
            Some(last) if start <= last.1 => last.1 = last.1.max(end),
            _ => merged.push((start, end)),
        }
    }
    merged
}

/// The letters a string holds, one bit per `a` to `z`.
///
/// A query whose mask is not a subset of a candidate's cannot match it, so one
/// `AND` rejects most rows before the matcher reads a character. Digits and
/// punctuation are outside the mask and so never reject on their own.
#[must_use]
pub fn letter_mask(text: &str) -> u32 {
    text.bytes().fold(0, |mask, byte| {
        let lower = byte.to_ascii_lowercase();
        if lower.is_ascii_lowercase() {
            mask | 1 << (lower - b'a')
        } else {
            mask
        }
    })
}

/// Whether `candidate`'s letters cover every letter the query asks for.
#[must_use]
pub const fn mask_covers(candidate: u32, query: u32) -> bool {
    query & !candidate == 0
}

#[cfg(test)]
mod tests {
    use super::*;

    fn query(raw: &str) -> Query {
        Query::parse(raw).unwrap()
    }

    /// The matched substrings a match marks, which is what a row draws.
    fn marked(raw: &str, text: &str) -> Option<Vec<String>> {
        let matched = query(raw).matches(text)?;
        Some(
            matched
                .ranges
                .iter()
                .map(|&(start, end)| text[start as usize..end as usize].to_owned())
                .collect(),
        )
    }

    fn score(raw: &str, text: &str) -> f64 {
        query(raw)
            .matches(text)
            .unwrap_or_else(|| panic!("{raw:?} did not match {text:?}"))
            .score
    }

    #[test]
    fn parses_nothing_out_of_an_empty_query() {
        assert!(Query::parse("   ").is_none());
    }

    #[test]
    fn matches_a_run_of_characters() {
        assert_eq!(marked("nasus", "nasus.bin").unwrap(), ["nasus"]);
    }

    #[test]
    fn ignores_case_on_both_sides() {
        assert_eq!(marked("AATROX", "Aatrox_Base.bin").unwrap(), ["Aatrox"]);
    }

    #[test]
    fn reports_no_match_when_the_run_is_broken() {
        assert!(query("nasus").matches("n_a_s_u_s.bin").is_none());
    }

    /// The reason this replaced a subsequence matcher.
    #[test]
    fn reports_no_match_for_a_query_scattered_over_a_path() {
        assert!(
            query("nasus")
                .matches("assets/characters/smolder/sounds/charizard_sfx_audio.bnk")
                .is_none()
        );
    }

    #[test]
    fn holds_every_term_or_nothing() {
        let text = "assets/characters/nasus/skins/base/nasus_base_tx_cm.dds";
        assert_eq!(marked("nasus tx", text).unwrap(), ["nasus", "tx"]);
        assert!(query("nasus zed").matches(text).is_none());
    }

    #[test]
    fn marks_each_term_where_it_reads_best() {
        let marks = marked("base dds", "skins/base/aatrox.dds").unwrap();
        assert_eq!(marks, ["base", "dds"]);
    }

    #[test]
    fn folds_two_terms_that_meet_into_one_run() {
        assert_eq!(marked("na sus", "nasus.bin").unwrap(), ["nasus"]);
    }

    #[test]
    fn prefers_a_term_that_opens_a_word() {
        // Both hold `base`, and only one of them opens a word with it.
        assert!(score("base", "skins/base/skin.bin") > score("base", "databases.bin"));
    }

    #[test]
    fn prefers_a_term_that_is_a_whole_word() {
        assert!(score("base", "skins/base/skin.bin") > score("base", "skins/basename.bin"));
    }

    #[test]
    fn scores_every_term_it_holds() {
        assert!(score("nasus base", "nasus/base.bin") > score("nasus", "nasus/base.bin"));
    }

    #[test]
    fn reads_a_term_that_opens_on_a_capital() {
        assert_eq!(marked("base", "AatroxBase.bin").unwrap(), ["Base"]);
        assert!(score("base", "AatroxBase.bin") > score("base", "databases.bin"));
    }

    #[test]
    fn reports_where_a_name_opens_with_the_query() {
        assert!(query("nasus").starts("nasus.bin"));
        assert!(!query("nasus").starts("old_nasus.bin"));
    }

    #[test]
    fn scores_a_candidate_that_is_not_ascii_without_marking_it() {
        let matched = query("ab").matches("\u{00e9}ab").unwrap();
        assert!(matched.score > 0.0);
        assert!(matched.ranges.is_empty());
    }

    #[test]
    fn covers_a_query_whose_letters_the_candidate_holds() {
        assert!(mask_covers(letter_mask("aatrox.bin"), query("ari").mask()));
    }

    #[test]
    fn rejects_a_query_holding_a_letter_the_candidate_does_not() {
        assert!(!mask_covers(letter_mask("aatrox.bin"), query("zed").mask()));
    }

    #[test]
    fn never_rejects_on_a_digit_or_a_separator() {
        assert!(mask_covers(letter_mask("skin.bin"), query("01/").mask()));
    }

    fn find(pattern: &str, syntax: PatternSyntax) -> FindQuery {
        FindQuery::parse(pattern, syntax)
            .unwrap()
            .unwrap_or_else(|| panic!("{pattern:?} parsed as nothing"))
    }

    #[test]
    fn parses_no_find_query_out_of_an_empty_pattern() {
        assert!(
            FindQuery::parse("", PatternSyntax::Literal)
                .unwrap()
                .is_none()
        );
        assert!(
            FindQuery::parse("", PatternSyntax::Regex)
                .unwrap()
                .is_none()
        );
    }

    #[test]
    fn a_literal_matches_its_metacharacters_as_characters() {
        let literal = find("skin.bin", PatternSyntax::Literal);
        assert!(literal.matches("base/skin.bin").is_some());
        assert!(literal.matches("base/skinxbin").is_none());
    }

    #[test]
    fn a_regex_matches_as_a_regex() {
        let pattern = find(r"skin0[12]\.bin$", PatternSyntax::Regex);
        assert!(pattern.matches("aatrox/skin01.bin").is_some());
        assert!(pattern.matches("aatrox/skin03.bin").is_none());
        assert!(pattern.matches("aatrox/skin01.bin.bak").is_none());
    }

    #[test]
    fn an_invalid_regex_reports_its_error() {
        assert!(FindQuery::parse("skin(", PatternSyntax::Regex).is_err());
    }

    #[test]
    fn a_find_query_ignores_case_under_either_syntax() {
        assert!(
            find("AATROX", PatternSyntax::Literal)
                .matches("aatrox.bin")
                .is_some()
        );
        assert!(
            find("aatrox", PatternSyntax::Regex)
                .matches("AATROX.BIN")
                .is_some()
        );
    }

    #[test]
    fn marks_every_run_the_pattern_matched() {
        let runs = find("aa", PatternSyntax::Literal)
            .matches("aa_x_aa")
            .unwrap();
        assert_eq!(runs, [(0, 2), (5, 7)]);
    }

    #[test]
    fn drops_a_run_that_is_empty() {
        // `x*` matches the empty string everywhere, and nothing else here.
        assert!(find("x*", PatternSyntax::Regex).matches("aaa").is_none());
        // The empty runs around `aa` are dropped and the real one is kept.
        assert_eq!(
            find("a*", PatternSyntax::Regex).matches("baab").unwrap(),
            [(1, 3)]
        );
    }

    #[test]
    fn finds_a_candidate_that_is_not_ascii_without_marking_it() {
        let runs = find("ab", PatternSyntax::Literal)
            .matches("\u{00e9}ab")
            .unwrap();
        assert!(runs.is_empty());
    }
}
