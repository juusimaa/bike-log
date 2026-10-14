// One stand-in for every Bike Log image; STANDIN_ROLE selects the behaviour.
const http = require("node:http");

const role = process.env.STANDIN_ROLE;
const args = process.argv.slice(2);
process.on("SIGTERM", () => process.exit(0));

switch (role) {
  case "web-ok":
  case "web-bad":
    http
      .createServer((req, res) => {
        res.writeHead(req.url === "/healthz" && role === "web-ok" ? 200 : 503);
        res.end(role);
      })
      .listen(3000, "0.0.0.0");
    break;
  case "api":
    // As `ops`, print the operator arguments; as `api`, stay up.
    if (args.length > 0) {
      console.log(`STANDIN-OPS ${JSON.stringify(args)}`);
    } else {
      console.log(`STANDIN-API marker=${process.env.STANDIN_MARKER ?? ""}`);
      setInterval(() => {}, 1 << 30);
    }
    break;
  case "migrate-ok":
  case "migrate-fail":
    console.log("STANDIN-MIGRATE-RAN");
    process.exit(role === "migrate-ok" ? 0 : 1);
    break;
  case "backup":
    console.log(`STANDIN-BACKUP-RAN ${JSON.stringify(args)}`);
    break;
  default:
    console.error(`unknown STANDIN_ROLE ${role}`);
    process.exit(2);
}
