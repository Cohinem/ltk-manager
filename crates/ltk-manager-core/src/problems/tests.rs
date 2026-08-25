//! Unit tests for problem identity, the report's tallies and the run's wire shape.

use super::*;

fn site() -> Site {
    Site::node(
        "base",
        "data/characters/smolder/skins/skin0.bin",
        NodeAddress {
            entry: BinHash(0x2a1f_3c7d),
            path: "iconPath".to_owned(),
            label: None,
        },
    )
}

#[test]
fn a_site_reads_layer_file_and_node_in_that_order() {
    assert_eq!(
        site().to_string(),
        "base · data/characters/smolder/skins/skin0.bin · 0x2a1f3c7d:iconPath"
    );
}

#[test]
fn a_file_site_names_no_node() {
    let site = Site::file("base", "mod.config.json");
    assert_eq!(site.to_string(), "base · mod.config.json");
    assert!(site.node.is_none());
}

/// Two runs over an unchanged file must key a row the same way, or the
/// panel loses a user's selection every time the list refreshes.
#[test]
fn a_problem_id_is_the_same_for_the_same_rule_and_site() {
    let rule = RuleId("bin/property-type");
    assert_eq!(ProblemId::new(rule, &site()), ProblemId::new(rule, &site()));
}

#[test]
fn a_problem_id_separates_rule_layer_path_and_node() {
    let id = ProblemId::new(RuleId("bin/property-type"), &site());
    assert_eq!(
        id.to_string(),
        "bin/property-type@base:data/characters/smolder/skins/skin0.bin#0x2a1f3c7d:iconPath"
    );
}

#[test]
fn two_sites_in_one_file_take_different_ids() {
    let rule = RuleId("bin/property-type");
    let other = Site::node(
        "base",
        "data/characters/smolder/skins/skin0.bin",
        NodeAddress {
            entry: BinHash(0x2a1f_3c7d),
            path: "particlePaths".to_owned(),
            label: None,
        },
    );
    assert_ne!(ProblemId::new(rule, &site()), ProblemId::new(rule, &other));
}

#[test]
fn a_report_counts_by_severity() {
    let rule = RuleId("bin/property-type");
    let mut report = Report::default();
    report.problem(rule, Severity::Error, site(), Detail::new("wrong type"));
    report.problem(
        rule,
        Severity::Warning,
        Site::file("base", "mod.config.json"),
        Detail::new("no thumbnail"),
    );
    let (problems, failed) = report.finish();

    let run = Run {
        at: Utc::now(),
        rules: Vec::new(),
        objects: Vec::new(),
        problems,
        failed,
    };
    assert_eq!(
        run.counts(),
        Counts {
            fatals: 0,
            errors: 1,
            warnings: 1,
            infos: 0
        }
    );
}

#[test]
fn a_node_address_round_trips_as_a_hex_string() {
    let address = NodeAddress {
        entry: BinHash(0x0032_9f1d),
        path: "mAnimationFilePath".to_owned(),
        label: None,
    };
    let json = serde_json::to_value(&address).unwrap();
    assert_eq!(json["entry"], "0x00329f1d");

    let back: NodeAddress = serde_json::from_value(json).unwrap();
    assert_eq!(back, address);
}

/// A hash no table holds is left out, and the panel reads the hex instead.
/// Listing it with its hex as the name would draw the same string twice.
#[test]
fn an_object_no_table_names_is_left_out_of_the_catalogue() {
    let mut report = Report::default();
    report.problem(
        RuleId("bin/property-type"),
        Severity::Warning,
        Site::node(
            "base",
            "skin0.bin",
            NodeAddress {
                entry: BinHash(0x0032_9f1d),
                path: "mAnimationFilePath".to_owned(),
                label: None,
            },
        ),
        Detail::new("wrong type"),
    );
    let (problems, _) = report.finish();

    assert!(ObjectInfo::catalogue(&problems, &BinNames::none()).is_empty());
}

#[test]
fn a_run_serializes_as_camel_case() {
    let json = serde_json::to_value(Run {
        at: Utc::now(),
        rules: Vec::new(),
        objects: Vec::new(),
        problems: Vec::new(),
        failed: Vec::new(),
    })
    .unwrap();
    assert!(json["problems"].is_array());
    assert!(json["failed"].is_array());
}

#[test]
fn a_rule_that_speaks_about_every_project_is_active() {
    let info = rules::bin_property_type::BinPropertyType::new().info();
    assert_eq!(info.state, RuleState::Active);
}

#[test]
fn a_dormant_rule_serializes_with_every_length_of_its_reason() {
    let json = serde_json::to_value(RuleState::Dormant {
        waiting: "Patch 16.17".to_owned(),
        reason: "These break when patch 16.17 arrives.".to_owned(),
        detail: Some("Your game is on 16.16.8049184".to_owned()),
    })
    .unwrap();
    assert_eq!(json["kind"], "dormant");
    assert_eq!(json["waiting"], "Patch 16.17");
    assert_eq!(json["reason"], "These break when patch 16.17 arrives.");
    assert_eq!(json["detail"], "Your game is on 16.16.8049184");
}

#[test]
fn the_state_holds_one_run_for_each_project() {
    let state = ProblemsState::default();
    let project = Path::new("X:/lol-mods/charizard-smolder-x");
    assert!(state.last(project).unwrap().is_none());

    state
        .record(
            project,
            Run {
                at: Utc::now(),
                rules: Vec::new(),
                objects: Vec::new(),
                problems: Vec::new(),
                failed: Vec::new(),
            },
        )
        .unwrap();
    assert!(state.last(project).unwrap().is_some());

    state.invalidate(project).unwrap();
    assert!(state.last(project).unwrap().is_none());
}
