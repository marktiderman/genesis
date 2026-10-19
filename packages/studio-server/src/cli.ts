// `npx genesis-studio-server sql [--role <name>] [--login-role <name>]`
// prints the setup migration.
import { studioSetupSql } from "./setup-sql";

const [command, ...rest] = process.argv.slice(2);
function flag(name: string): string | undefined {
  const at = rest.indexOf(name);
  return at >= 0 ? rest[at + 1] : undefined;
}

if (command === "sql") {
  process.stdout.write(studioSetupSql({ role: flag("--role"), loginRole: flag("--login-role") }));
} else {
  process.stderr.write(
    "Usage: genesis-studio-server sql [--role <name>] [--login-role <name>]\n" +
      "  Prints the SQL that installs the studio's audit trail. Save it as a migration.\n" +
      "  --role        the role the studio acts as (default: authenticated)\n" +
      "  --login-role  the handler's own login; only it may write audit entries\n",
  );
  process.exitCode = command ? 1 : 0;
}
