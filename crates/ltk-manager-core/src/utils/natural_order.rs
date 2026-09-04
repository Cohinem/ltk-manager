//! Natural order over file names, matching what the frontend sorts by.
//!
//! The twin is `compareNames` in `src/modules/workshop/utils/naturalOrder.ts`.
//! Change one and the other's `naturalOrder.fixture.json` test fails.

use std::cmp::Ordering;

/// Compare two file names the way a file explorer does.
pub fn compare_names(a: &str, b: &str) -> Ordering {
    let (left, right) = (a.as_bytes(), b.as_bytes());
    let (mut i, mut j) = (0, 0);

    while i < left.len() && j < right.len() {
        if left[i].is_ascii_digit() && right[j].is_ascii_digit() {
            let (a_run, b_run) = (digit_run(&left[i..]), digit_run(&right[j..]));
            i += a_run.len();
            j += b_run.len();

            let (a_digits, b_digits) = (trim_leading_zeros(a_run), trim_leading_zeros(b_run));
            /* Longer is larger once the padding is off, so this reads the two
            runs as numbers without parsing one that would overflow. */
            match a_digits
                .len()
                .cmp(&b_digits.len())
                .then_with(|| a_digits.cmp(b_digits))
            {
                Ordering::Equal => continue,
                order => return order,
            }
        }

        match left[i]
            .to_ascii_lowercase()
            .cmp(&right[j].to_ascii_lowercase())
        {
            Ordering::Equal => {
                i += 1;
                j += 1;
            }
            order => return order,
        }
    }

    /* The length decides which name is the prefix of the other, and the byte
    compare only breaks ties the fold and the padding left equal. */
    (left.len() - i)
        .cmp(&(right.len() - j))
        .then_with(|| a.cmp(b))
}

fn digit_run(bytes: &[u8]) -> &[u8] {
    let end = bytes
        .iter()
        .position(|byte| !byte.is_ascii_digit())
        .unwrap_or(bytes.len());
    &bytes[..end]
}

fn trim_leading_zeros(digits: &[u8]) -> &[u8] {
    let first = digits
        .iter()
        .position(|&byte| byte != b'0')
        .unwrap_or(digits.len());
    &digits[first..]
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The orderings the frontend's `compareNames` must produce too.
    ///
    /// Read `naturalOrder.fixture.json`'s own comment for the contract.
    #[test]
    fn obeys_the_shared_ordering_fixture() {
        #[derive(serde::Deserialize)]
        struct Fixture {
            cases: Vec<Case>,
        }
        #[derive(serde::Deserialize)]
        struct Case {
            name: String,
            input: Vec<String>,
            expect: Vec<String>,
        }

        let raw = include_str!(
            "../../../../src/modules/workshop/utils/__tests__/naturalOrder.fixture.json"
        );
        let fixture: Fixture = serde_json::from_str(raw).unwrap();

        for case in fixture.cases {
            let mut sorted = case.input.clone();
            sorted.sort_by(|a, b| compare_names(a, b));
            assert_eq!(sorted, case.expect, "{}", case.name);

            /* Reversed too, so a case the given order already satisfies does not
            pass for that reason. */
            let mut reversed: Vec<String> = case.input.into_iter().rev().collect();
            reversed.sort_by(|a, b| compare_names(a, b));
            assert_eq!(reversed, case.expect, "{} (reversed)", case.name);
        }
    }

    #[test]
    fn equal_names_compare_equal() {
        assert_eq!(compare_names("skin1.bin", "skin1.bin"), Ordering::Equal);
    }
}
