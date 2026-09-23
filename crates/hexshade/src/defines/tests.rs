use super::*;

#[test]
fn collecting_keeps_the_first_value_of_a_name_and_orders_by_name() {
    let defines = Defines::from_iter([("B", "1"), ("A", ""), ("B", "2")]);

    assert_eq!(defines.to_entries(), ["A=", "B=1"]);
    assert_eq!(defines.to_string(), "A= B=1");
}

#[test]
fn an_insert_leaves_a_name_the_list_already_sets() {
    let mut defines = Defines::from_iter([("DISABLE_FOW", "0")]);

    defines.insert_missing("DISABLE_FOW", "1");
    defines.insert_missing("DISABLE_SHADOWS", "1");

    assert_eq!(defines.to_entries(), ["DISABLE_FOW=0", "DISABLE_SHADOWS=1"]);
}
