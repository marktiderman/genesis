// `npx genesis-studio-server sql [--role <name>]` prints the setup migration.
import { studioSetupSql } from "./setup-sql";

const [command, ...rest] = process.argv.slice(2);
const roleFlag = rest.indexOf("--role");
const role = roleFlag >= 0 ? rest[roleFlag + 1] : undefined;

if (command === "sql") {
  process.stdout.write(studioSetupSql({ role }));
} else {
  process.stderr.write(
    "Usage: genesis-studio-server sql [--role <name>]\n" +
      "  Prints the SQL that installs the studio's audit trail. Save it as a migration.\n",
  );
  process.exitCode = command ? 1 : 0;
}
