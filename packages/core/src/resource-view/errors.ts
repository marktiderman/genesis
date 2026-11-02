// The error defineView and its helpers throw for a view that doesn't fit its contract.

/** A view that names a field, preset or section its contract doesn't have. */
export class ViewDefinitionError extends Error {
  readonly problems: readonly string[];
  constructor(resource: string, problems: readonly string[]) {
    super(`defineView(${resource}): ${problems.join("; ")}`);
    this.name = "ViewDefinitionError";
    this.problems = problems;
  }
}
