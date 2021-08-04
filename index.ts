import { promises as fs } from "fs";
import { degrees, PDFDocument, PDFEmbeddedPage, PageSizes } from "pdf-lib";

const args = process.argv.slice(2).map((x) => x.trim());

function inChunks<A>(input: ReadonlyArray<A>, numInChunks: number) {
  let chunked: A[][] = [];
  let ptr = 0;
  input.forEach((it, index) => {
    if (index % numInChunks == 0) {
      ptr = chunked.push([]) - 1;
    }
    chunked[ptr].push(it);
  });
  return chunked;
}

async function main() {
  const inputFileName = args[0];
  if (!inputFileName) {
    console.error("A filename must be given");
    process.exit(-1);
  }
  const bytes = await fs.readFile(inputFileName, null);
  const inputPdfDoc = await PDFDocument.load(bytes);
  const inputPages = inputPdfDoc.getPages();

  const outputPdfDoc = await PDFDocument.create();

  let embeddedPages: (PDFEmbeddedPage | null)[] = await outputPdfDoc.embedPages(
    inputPages,
  );

  if (args.includes("--skip-first")) {
    embeddedPages = [null, ...embeddedPages];
  }

  const margin = 72 / 4;
  for (const chunks of inChunks(embeddedPages, 2)) {
    const outputPage = outputPdfDoc.addPage(PageSizes.A4);
    for (let i = 0; i < chunks.length; i++) {
      const inputPage = chunks[i];
      if (inputPage === null) {
        continue;
      }
      const yOffset =
        outputPage.getHeight() - (outputPage.getHeight() / chunks.length) * i;
      outputPage.drawPage(inputPage, {
        rotate: degrees(-90),
        x: margin,
        y: yOffset - margin,
      });
    }
  }

  const outputBytes = await outputPdfDoc.save();
  const outputFileName = "result.pdf";// inputFileName.replace(".pdf", "-processed.pdf");
  await fs.writeFile(outputFileName, outputBytes);
}

main();
