import legacyFs, { promises as fs } from "fs";
import path from "path";
import { degrees, PageSizes, PDFDocument, PDFEmbeddedPage } from "pdf-lib";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf";
import { loadBandcampApi, OauthToken } from "./bandcamp-api";
import { groupBy } from "./groupBy";

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

async function loadInput() {
  const inputFileName = args[0];
  if (!inputFileName) {
    console.error("A filename must be given");
    process.exit(-1);
  }
  const bytes = await fs.readFile(inputFileName, null);
  const inputPdfDoc = await PDFDocument.load(bytes);
  const pdfjsDoc = await pdfjs.getDocument(inputFileName).promise;
  return [inputPdfDoc, pdfjsDoc] as const;
}

async function to102x162mm() {
  const [inputPdfDoc, pdfjsDoc] = await loadInput();
  const inputPages = inputPdfDoc.getPages();

  const outputPdfDoc = await PDFDocument.create();
  const bandcampCredentials = require("./bandcamp-credentials.json");
  const tokenPath = path.resolve(__dirname, ".bandcamp-oauth-token.json");

  async function readToken(): Promise<OauthToken | undefined> {
    if (legacyFs.existsSync(tokenPath)) {
      return JSON.parse(legacyFs.readFileSync(tokenPath, "utf-8"));
    }
  }
  const bcApi = loadBandcampApi({
    url: "https://bandcamp.com",
    bandcampId: bandcampCredentials.id,
    secret: bandcampCredentials.secret,
    readToken,
    storeToken: async (token) => {
      return fs.writeFile(tokenPath, JSON.stringify(token, null, 2));
    },
  });

  const itemOrders = await bcApi.orders({
    band_id: bandcampCredentials.band_id,
    unshipped_only: false,
  });
  const orders = groupBy(itemOrders, "payment_id");
  // console.log("orders", orders);

  let embeddedPages: (PDFEmbeddedPage | null)[] = await outputPdfDoc.embedPages(
    inputPages,
  );

  const margin = 72 / 3;
  let i = 1;
  for (const inputPage of embeddedPages) {
    if (inputPage === null) {
      continue;
    }
    const outputPage = outputPdfDoc.addPage([4.094 * 72, 6.457 * 72]);
    const page = await pdfjsDoc.getPage(i);
    const pageTextItems = await page.getTextContent();
    // console.log("pageTextItems", pageTextItems);
    const pageText = pageTextItems.items.flatMap((item) =>
      "str" in item ? [item.str] : [],
    );
    const referenceMatch = pageText.flatMap((t) => {
      const matches = [
        ...(t.trim().match(/ORM-(\d+)/) ?? []),
        ...(t.trim().match(/Reference: *(\d+)/) ?? []),
        ...(t.trim().match(/^(\d+)$/) ?? []),
      ];
      return matches
        .filter((match) => match && orders[Number(match)])
        .map((x) => Number(x));
    });
    const sendersReference = referenceMatch?.[0] ?? 0;
    const orderLines = orders[sendersReference]?.map(
      (x) =>
        `${x.quantity > 1 ? `${x.quantity} × ` : ''}${x.item_name.replace(" by ORM", "")}${
          x.option ? ` (${x.option})` : ""
        }`,
    );
    if (orderLines.length === 0) {
      console.log("================ COULD NOT FIND ORDERS FOR PAGE " + i + " =============");
      console.log(pageText);
      console.log("reference", sendersReference);
      console.log("referenceMatch", referenceMatch);
      console.log("orderLines", orderLines);
    }

    const xScale = outputPage.getWidth() / inputPage.width;
    const yScale = outputPage.getHeight() / inputPage.height;
    const scale = Math.min(xScale, yScale);
    outputPage.drawPage(inputPage, {
      xScale: scale,
      yScale: scale,
      x: 0, // margin,
      y: 0, // margin,
    });
    if (orderLines) {
      outputPage.drawText(
        inChunks(orderLines, 3)
          .map((x) => x.join("\t\t"))
          .join("\n"),
        {
          size: 8,
          lineHeight: 8,
          x: outputPage.getWidth() - 10,
          y: outputPage.getHeight() - 10,
          rotate: degrees(270),
        },
      );
    }
    i++;
  }

  const outputBytes = await outputPdfDoc.save();
  const outputFileName = "result.pdf"; // inputFileName.replace(".pdf", "-processed.pdf");
  await fs.writeFile(outputFileName, outputBytes);
}

async function toDoubleA4Sheets() {
  const [inputPdfDoc] = await loadInput();
  const inputPages = inputPdfDoc.getPages();

  const outputPdfDoc = await PDFDocument.create();

  let embeddedPages: (PDFEmbeddedPage | null)[] = await outputPdfDoc.embedPages(
    inputPages,
  );

  if (args.includes("--skip-first")) {
    embeddedPages = [null, ...embeddedPages];
  }

  const margin = 72 / 3;
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
  const outputFileName = "result.pdf"; // inputFileName.replace(".pdf", "-processed.pdf");
  await fs.writeFile(outputFileName, outputBytes);
}

switch (args[0]) {
  case "to-A4":
    args.shift();
    toDoubleA4Sheets()
    break;
  case "to-102x162":
  default:
    args.shift()
    to102x162mm()
    break;
}
