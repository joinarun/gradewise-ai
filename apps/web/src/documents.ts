export type ImageMime = "image/jpeg" | "image/png";
export type ImportedDocument = { text: string; images: boolean; emptyPages: number[] };

const fileLimit = 15 * 1024 * 1024;
const textLimit = 150_000;
const pageLimit = 50;

export function imageMime(file: File): ImageMime | null {
  if (file.type === "image/png" || /\.png$/i.test(file.name)) return "image/png";
  if (file.type === "image/jpeg" || /\.jpe?g$/i.test(file.name)) return "image/jpeg";
  return null;
}

export async function extractDocument(file: File): Promise<ImportedDocument> {
  if (file.size > fileLimit) throw new Error("Choose a file under 15 MB.");
  if (imageMime(file)) return { text: "", images: true, emptyPages: [] };
  if (file.type === "text/plain" || /\.txt$/i.test(file.name)) {
    const text = await file.text();
    if (text.length > textLimit) throw new Error("Choose a shorter text document.");
    return { text, images: false, emptyPages: [] };
  }
  if (file.type !== "application/pdf" && !/\.pdf$/i.test(file.name)) {
    throw new Error("Use TXT, PDF, PNG or JPEG.");
  }

  const [pdfjs, worker] = await Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  try {
    const document = await task.promise;
    if (document.numPages > pageLimit) throw new Error("Split the PDF into files of 50 pages or fewer.");
    const pages: string[] = [];
    const emptyPages: number[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = content.items
        .filter((item) => "str" in item)
        .map((item) => item.str + (item.hasEOL ? "\n" : " "))
        .join("")
        .trim();
      if (!text) emptyPages.push(pageNumber);
      pages.push(text);
      page.cleanup();
    }
    const text = pages.filter(Boolean).join("\n\n");
    if (text.length > textLimit) throw new Error("Choose a shorter PDF.");
    return { text, images: emptyPages.length > 0, emptyPages };
  } finally {
    await task.destroy();
  }
}

export function parsePaper(text: string, questionIds: string[]) {
  function normalizeId(id: string) {
    return id.trim().replace(/^(?:question\s+|q\s*(?=\d))/i, "").replace(/[()]/g, "").toLowerCase();
  }
  const knownIds = new Map(questionIds.map((id) => [normalizeId(id), id]));
  const output: { questionId: string; text: string }[] = [];
  let current: { questionId: string; text: string } | undefined;
  for (const line of text.replace(/\r\n?/g, "\n").split("\n")) {
    const numbered = line.match(/^\s*((?:question\s+|q\s*)?\d+(?:\([a-z\d]+\)|[a-z]|\.[a-z\d]+)?)\s*[.):–-]\s*(.*)$/i);
    const named = line.match(/^\s*([\w().-]+)\s*:\s*(.*)$/);
    const heading = numbered ?? named;
    const id = heading ? knownIds.get(normalizeId(heading[1])) : undefined;
    if (heading && (id || numbered)) {
      if (current) output.push({ ...current, text: current.text.trim() });
      current = { questionId: id ?? "", text: heading[2] };
    } else if (current) {
      current.text += "\n" + line;
    } else if (line.trim()) {
      current = { questionId: "", text: line };
    }
  }
  if (current) output.push({ ...current, text: current.text.trim() });
  if (!output.length) output.push({ questionId: "", text: "" });
  if (output.length === 1 && !output[0].questionId && questionIds.length === 1) {
    output[0].questionId = questionIds[0];
  }
  return output;
}
