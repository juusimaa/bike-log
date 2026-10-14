// One stand-in for every Bike Log image; STANDIN_ROLE selects the behaviour.
const http = require("node:http");

const role = process.env.STANDIN_ROLE;
const args = process.argv.slice(2);
process.on("SIGTERM", () => process.exit(0));

switch (role) {
  case "web-ok":
  case "web-bad":
    // Like the real web app, /healthz is healthy only when the API's readiness is.
    http
      .createServer(async (req, res) => {
        let ok = false;
        if (req.url === "/healthz" && role === "web-ok") {
          ok = await fetch("http://127.0.0.1:5080/health/ready", { signal: AbortSignal.timeout(3000) }).then(
            (r) => r.ok,
            () => false,
          );
        }
        res.writeHead(ok ? 200 : 503);
        res.end(role);
      })
      .listen(3000, "0.0.0.0");
    break;
  case "api":
    // As `ops`, print the operator arguments; as `api`, answer readiness on loopback,
    // failing when its settings file says STANDIN_MARKER=broken (a database it
    // cannot reach).
    if (args.length > 0) {
      console.log(`STANDIN-OPS ${JSON.stringify(args)}`);
    } else {
      const marker = process.env.STANDIN_MARKER ?? "";
      console.log(`STANDIN-API marker=${marker}`);
      http
        .createServer((req, res) => {
          res.writeHead(req.url === "/health/ready" && marker !== "broken" ? 200 : 503);
          res.end();
        })
        .listen(5080, "127.0.0.1");
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
