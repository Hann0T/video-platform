import { createApp } from "./app.js";
import { createContainer } from "./container.js";

function main() {
  const container = createContainer();
  const app = createApp(container);
  const { port } = container.config;

  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`Server listening on http://localhost:${port}`);
  });
}

main();
