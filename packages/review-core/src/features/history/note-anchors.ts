import type { LocalNoteSchema, PreviewFileSchema } from "@senslop/contracts";

export const carrySnapshotNotes = (
  notes: LocalNoteSchema[],
  files: PreviewFileSchema[],
  previewId: string,
): LocalNoteSchema[] =>
  notes.flatMap((note) => {
    const file = files.find((file) => file.path === note.path);
    if (!file) return [];
    if (!note.line) return [{ ...note, previewId }];
    const contents = note.line.side === "additions" ? file.after : file.before;
    if (contents === null) return [];
    const lines = contents.split("\n");
    const start = note.line.lineNumber;
    const end = note.line.endLineNumber ?? start;
    if (
      end <= lines.length &&
      lines.slice(start - 1, end).join("\n") === note.line.code
    )
      return [{ ...note, previewId }];
    // Move an anchor only when the exact excerpt has one complete-line match.
    let match: number | undefined;
    let offset: number = 0;
    while (offset <= contents.length) {
      const found: number = contents.indexOf(note.line.code, offset);
      if (found < 0) break;
      const after = found + note.line.code.length;
      if (
        (found === 0 || contents[found - 1] === "\n") &&
        (after === contents.length || contents[after] === "\n")
      ) {
        if (match !== undefined) return [];
        match = found;
      }
      offset = found + 1;
    }
    if (match === undefined) return [];
    const lineNumber = contents.slice(0, match).split("\n").length;
    return [
      {
        ...note,
        previewId,
        line: {
          ...note.line,
          lineNumber,
          ...(note.line.endLineNumber
            ? { endLineNumber: lineNumber + end - start }
            : {}),
        },
      },
    ];
  });
