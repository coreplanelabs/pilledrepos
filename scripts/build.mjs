import { copyFile, cp, mkdir, readdir } from "node:fs/promises";
await Promise.all(
  [
    "index.html",
    "styles.css",
    "theme-init.js",
    "favicon.svg",
    "_headers",
    ".assetsignore",
  ].map((file) =>
    copyFile(
      new URL(`../public/${file}`, import.meta.url),
      new URL(`../dist/${file}`, import.meta.url),
    ),
  ),
);
await cp(
  new URL("../public/assets/", import.meta.url),
  new URL("../dist/assets/", import.meta.url),
  { recursive: true },
);
const examples = new URL("../public/examples/", import.meta.url);
try {
  const files = await readdir(examples);
  await mkdir(new URL("../dist/examples/", import.meta.url), {
    recursive: true,
  });
  await Promise.all(
    files
      .filter((file) => /^[a-zA-Z0-9-]+\.json$/.test(file))
      .map((file) =>
        copyFile(
          new URL(file, examples),
          new URL(`../dist/examples/${file}`, import.meta.url),
        ),
      ),
  );
} catch (error) {
  if (
    !(error instanceof Error) ||
    !("code" in error) ||
    error.code !== "ENOENT"
  )
    throw error;
}
