import { Button } from "@marktiderman/genesis-ui";

export function Form() {
  return (
    <div>
      <button type="submit">Save</button>
      <input name="title" />
      <label htmlFor="title">Title</label>
      <hr/>
      <select name="kind" />
      {/* <button>commented out</button> */}
      <Button>Fine</Button>
      <buttonish />
    </div>
  );
}
