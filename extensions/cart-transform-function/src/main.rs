use shopify_function::prelude::*;
use std::process;

// pub mod run;  // uncommented in Task 9 when run.rs is created
pub mod transform;

// #[typegen("schema.graphql")]  // restored in Task 9 when run.rs is created
// pub mod schema {
//     #[query("src/run.graphql")]
//     pub mod run {}
// }

fn main() {
    log!("Please invoke a named export.");
    process::abort();
}
