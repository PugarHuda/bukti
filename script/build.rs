use sp1_build::build_program_with_args;

fn main() {
    build_program_with_args("../program", Default::default());
    build_program_with_args("../program-prov", Default::default());
    build_program_with_args("../program-full", Default::default());
}
