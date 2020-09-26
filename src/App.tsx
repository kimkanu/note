import React, { useEffect, useState } from "react";
import "./App.css";

import * as IncrementalDOM from "incremental-dom";
import MarkdownIt from "markdown-it";
import MarkdownItKaTeX from "./utils/markdown-it-katex";
import MarkdownItIncrementalDOM from "markdown-it-incremental-dom";

import Creatable from "react-select/creatable";
import { FileSystem } from "./models/FileSystem";

import ace from "ace-builds";
import AceEditor from "react-ace-builds";
import "ace-builds/src-noconflict/mode-latex";
import "ace-builds/src-noconflict/theme-github";

import "katex/dist/katex.min.js";
import "katex/dist/katex.min.css";

import "highlight.js/styles/github.css";

const hljs = require("highlight.js/lib/core");
const latex = require("highlight.js/lib/languages/latex");

hljs.registerLanguage("latex", latex);
hljs.registerLanguage("tex", latex);

/* eslint import/no-webpack-loader-syntax: off */
ace.config.setModuleUrl(
  "ace/mode/markdown",
  require("file-loader?esModule=false!ace-builds/src-min-noconflict/mode-markdown.js")
);
ace.config.setModuleUrl(
  "ace/theme/github",
  require("file-loader?esModule=false!ace-builds/src-min-noconflict/theme-github.js")
);

const md = new MarkdownIt({
  linkify: true,
})
  .use(MarkdownItIncrementalDOM, IncrementalDOM)
  .use(require("markdown-it-center-text"))
  .use(MarkdownItKaTeX)
  .use(require("markdown-it-highlightjs"), { inline: true });

const MIN_WIDTH_FACTOR = 0.15;
const MAX_WIDTH_FACTOR = 1 - MIN_WIDTH_FACTOR;

const fileSystem = new FileSystem();

async function blobToBase64(blob: Blob): Promise<string> {
  const reader = new window.FileReader();
  reader.readAsDataURL(blob);
  return new Promise((resolve) => {
    reader.onloadend = () => {
      resolve(reader.result as string);
    };
  });
}

function removeComments(c: string): string {
  return c
    .split("\n")
    .filter((line) => !line.startsWith("%"))
    .join("\n");
}

function preSuffix(
  editor: any,
  pre: string = "",
  suf: string = "",
  trim = false
) {
  if (editor.getSelectedText().length === 0) {
    editor.selection.clearSelection();
    editor.selection.moveCursorLineStart();
    editor.selection.selectLineEnd();
  }

  if (trim) {
    const leftMargin =
      editor.getSelectedText().length -
      editor.getSelectedText().trimStart().length;
    const rightMargin =
      editor.getSelectedText().length -
      editor.getSelectedText().trimEnd().length;
    if (leftMargin > 0 || rightMargin > 0) {
      const { start, end } = editor.selection.getRange();
      editor.selection.clearSelection();
      editor.selection.moveCursorTo(start.row, start.column + leftMargin);
      editor.selection.selectTo(end.row, end.column - rightMargin);
    }
  }

  editor.session.replace(
    editor.selection.getRange(),
    `${pre}${editor.getSelectedText()}${suf}`
  );
}

let globalEditor: any = null;

function App() {
  const [widthFactor, setWidthFactor] = useState<number>(0.5);
  const [isDragging, setDragging] = useState<boolean>(false);

  const [currentFileName, setCurrentFileName] = useState<string | null>(
    fileSystem.current
  );
  const [content, setContent] = useState<string>(
    fileSystem.current ? fileSystem.getFile(fileSystem.current) ?? "" : ""
  );
  const [fileList, setFileList] = useState<string[]>(
    Array.from(fileSystem.index)
  );

  const [importButtonText, setImportButtonText] = useState(
    "Import from Hastebin"
  );
  const [exportButtonText, setExportButtonText] = useState(
    "Export to Hastebin"
  );

  const [isClipboardSupported, setClipboardSupported] = useState(false);

  // import from hastebin
  useEffect(() => {
    (async () => {
      if (window.location.hash && window.location.hash.length > 1) {
        const keyOrUrl = window.location.hash.slice(1);
        await importFromHastebin(keyOrUrl);
        window.location.hash = "";
      }
    })();
  }, []);

  useEffect(() => {
    if (currentFileName) {
      const c = removeComments(content);
      try {
        IncrementalDOM.patch(
          document.getElementById("renderer")!,
          (md as any).renderToIncrementalDOM(c)
        );
      } catch (e) {
        // when incremental-dom makes an error, just rerender it
        document.getElementById("renderer")!.innerHTML = (md as any).render(c);
      }
      fileSystem.updateFile(currentFileName, content);
    }
  }, [content, currentFileName]);

  // try to get the clipboard permission
  useEffect(() => {
    (async () => {
      try {
        const readPermissionResult = await navigator.permissions.query({
          name: "clipboard-read" as any,
        });
        if (readPermissionResult.state === "prompt") {
          (navigator.clipboard as any).read();
        } else if (readPermissionResult.state !== "granted") {
          throw new Error();
        }

        const writePermissionResult = await navigator.permissions.query({
          name: "clipboard-write" as any,
        });
        if (writePermissionResult.state === "prompt") {
          (navigator.clipboard as any).write();
        } else if (writePermissionResult.state === "granted") {
          setClipboardSupported(true);
        } else {
          throw new Error();
        }
      } catch {
        console.info("Clipboard API is not supported");
      }
    })();
  }, [isClipboardSupported]);

  async function importFromHastebin(keyOrUrl: string) {
    let key = keyOrUrl;
    if (keyOrUrl.includes("haste.zneix.eu/")) {
      const matches = keyOrUrl.match(/(?<=haste.zneix.eu\/)[^.]*/);
      if (!matches) {
        return;
      }
      key = matches[0];
    }

    setImportButtonText("Importing...");
    const url = `https://cors-anywhere.herokuapp.com/https://haste.zneix.eu/raw/${key}`;
    try {
      const filename = `hastebin:${key}`;
      const content = await (await fetch(url)).text();
      if (content === '{"message":"Document not found."}') {
        alert("Document not found.");
        setImportButtonText("Import from Hastebin");
        return;
      }
      fileSystem.createFile(filename);
      fileSystem.updateFile(filename, content);
      setFileList(Array.from(fileSystem.index));
      setCurrentFileName(filename);
      fileSystem.setCurrent(filename);
      setContent(content);
      setImportButtonText("Import from Hastebin");
    } catch (e) {
      setImportButtonText(e.toString());
      return;
    }
  }

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
      }}
      onMouseMove={(e) => {
        if (isDragging) {
          setWidthFactor(
            Math.min(
              Math.max(e.pageX / window.innerWidth, MIN_WIDTH_FACTOR),
              MAX_WIDTH_FACTOR
            )
          );
        }
      }}
      onMouseUp={() => {
        setDragging(false);
        if (globalEditor && globalEditor.getOption("wrap") !== "off") {
          globalEditor.setOption("wrap", false);
          globalEditor.setOption("wrap", true);
        }
      }}
      onMouseLeave={() => setDragging(false)}
    >
      <div
        style={{
          height: "3rem",
          backgroundColor: "#2d3748",
          display: "flex",
          alignItems: "center",
        }}
      >
        <div
          style={{
            width: "20rem",
            fontFamily: "Computer Modern Typewriter",
            padding: "0.25rem 0.5rem",
            zIndex: 10,
          }}
        >
          <Creatable
            isClearable
            placeholder="Select a file"
            options={fileList.map((s) => ({ label: s, value: s }))}
            value={
              currentFileName
                ? { label: currentFileName, value: currentFileName }
                : undefined
            }
            styles={{
              // Fixes the overlapping problem of the component
              menu: (provided) => ({ ...provided, zIndex: 9999 }),
            }}
            onChange={(value, action) => {
              if (action.action === "create-option") {
                if (!value) return;
                const filename = (value as { value: string }).value;
                fileSystem.createFile(filename);
                setFileList(Array.from(fileSystem.index));
                setCurrentFileName(filename);
                fileSystem.setCurrent(filename);
                setContent("");
              } else if (action.action === "select-option") {
                if (!value) return;
                const filename = (value as { value: string }).value;
                const content = fileSystem.getFile(filename);
                setCurrentFileName(filename);
                fileSystem.setCurrent(filename);
                setContent(content ?? "");
              } else if (action.action === "clear") {
                setCurrentFileName(null);
                fileSystem.setCurrent(null);
                setContent("");
              }
            }}
          />
        </div>
        <div
          className="hastebin-button"
          onClick={async () => {
            if (importButtonText === "Importing...") return;
            const keyOrUrl = prompt(
              "Please enter the url or the key of hastebin document",
              "https://haste.zneix.eu/about"
            );
            if (keyOrUrl === null) {
              return;
            }
            await importFromHastebin(keyOrUrl);
          }}
        >
          {importButtonText}
        </div>
        <div
          className="hastebin-button"
          onClick={async () => {
            if (exportButtonText === "Exporting...") return;
            if (content === "") return;

            setExportButtonText("Exporting...");
            const url =
              "https://cors-anywhere.herokuapp.com/https://haste.zneix.eu/documents";
            try {
              const { key }: { key: string } = await (
                await fetch(url, { method: "POST", body: content })
              ).json();
              window.open(`https://haste.zneix.eu/${key}.md`);
              setExportButtonText("Export to Hastebin");

              const filename = `hastebin:${key}`;
              fileSystem.createFile(filename);
              fileSystem.updateFile(filename, content);
              setFileList(Array.from(fileSystem.index));
              setCurrentFileName(filename);
              fileSystem.setCurrent(filename);
              setContent(content);
            } catch (e) {
              setExportButtonText(e.toString());
              return;
            }
          }}
        >
          {exportButtonText}
        </div>
      </div>
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "calc(100% - 3rem)",
        }}
      >
        <div
          style={{
            boxSizing: "border-box",
            padding: "1rem 1.5rem 1.5rem",
            width: `${widthFactor * 100}%`,
            height: "100%",
            backgroundColor: "#eae8ec",
          }}
        >
          <Editor
            content={content}
            setContent={setContent}
            currentFileName={currentFileName}
          />
        </div>
        <div
          id="renderer"
          style={{
            width: `${(1 - widthFactor) * 100}%`,
            height: "100%",
            boxSizing: "border-box",
            padding: "1rem 1.5rem 1.5rem",
            fontSize: "1.05rem",
            overflowY: "auto",
          }}
        >
          {currentFileName ? null : (
            <div
              style={{
                width: "100%",
                height: "100%",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                fontStyle: "italic",
                fontSize: "1.2rem",
              }}
            >
              <span>Open a file to edit!</span>
            </div>
          )}
        </div>
      </div>
      <div
        id="separator"
        style={{
          boxSizing: "border-box",
          marginLeft: `${widthFactor * 100}vw`,
        }}
        onMouseDownCapture={() => setDragging(true)}
      ></div>
    </div>
  );
}

type EditorProps = any; // todo
const Editor: React.FC<EditorProps> = React.memo(
  ({ content, setContent, currentFileName }) => (
    <AceEditor
      mode="latex"
      theme="github"
      onChange={setContent}
      value={content}
      width={"100%"}
      height="100%"
      editorProps={{ $blockScrolling: true }}
      style={{
        borderRadius: "0.75rem",
        boxShadow: "0 10px 20px rgba(0,0,0,0.19), 0 6px 6px rgba(0,0,0,0.23)",
      }}
      readOnly={currentFileName === null}
      onLoad={(editor: any) => {
        globalEditor = editor;

        editor.setOption("wrap", true);

        editor.commands.addCommand({
          name: "centering",
          bindKey: { win: "Alt-C", mac: "Option-C" },
          exec: () => {
            try {
              preSuffix(editor, "-> ", " <-");
            } catch (e) {}
          },
        });

        editor.commands.addCommand({
          name: "bold",
          bindKey: { win: "Ctrl-B", mac: "Command-B" },
          exec: () => {
            try {
              preSuffix(editor, "**", "**", true);
            } catch (e) {}
          },
        });

        editor.commands.addCommand({
          name: "italic",
          bindKey: { win: "Ctrl-I", mac: "Command-I" },
          exec: () => {
            try {
              preSuffix(editor, "_", "_", true);
            } catch (e) {}
          },
        });

        editor.commands.addCommand({
          name: "wordWrap",
          bindKey: { win: "Alt-Z", mac: "Option-Z" },
          exec: () => {
            editor.setOption("wrap", editor.getOption("wrap") === "off");
          },
        });

        editor.commands.addCommand({
          name: "cut",
          bindKey: { win: "Ctrl-X", mac: "Command-X" },
          exec: async () => {
            try {
              if (editor.getSelectedText().length === 0) {
                editor.selection.selectLine();
              }
              await navigator.clipboard.writeText(editor.getSelectedText());
              editor.session.replace(editor.selection.getRange(), "");
            } catch (e) {}
          },
        });

        navigator.permissions
          .query({ name: "clipboard-read" as any })
          .then((result) => {
            if (result.state === "prompt" || result.state === "granted") {
              editor.commands.addCommand({
                name: "customPaste",
                bindKey: { win: "Ctrl-V", mac: "Command-V" },
                exec: async () => {
                  const [data] = await (navigator.clipboard as any).read();
                  if (data.types[0] === "text/plain") {
                    editor.session.replace(
                      editor.selection.getRange(),
                      await (await data.getType("text/plain")).text()
                    );
                    const { row, column } = editor.selection.getRange().end;
                    editor.clearSelection();
                    editor.selection.moveCursorTo(row, column);
                  }
                  if (data.types[0] === "image/png") {
                    const formData = new FormData();
                    const base64Image = await blobToBase64(
                      await data.getType("image/png")
                    );
                    formData.append("image", base64Image.slice(22));

                    const response = await fetch(
                      "https://api.imgur.com/3/image",
                      {
                        method: "POST",
                        headers: {
                          Authorization: "Client-ID 7e06dc2fe0a78bb",
                        },
                        body: formData,
                      }
                    );
                    const {
                      data: { link },
                    } = await response.json();
                    editor.session.replace(
                      editor.selection.getRange(),
                      `![](${link})`
                    );
                    editor.selection.moveCursorBy(0, -link.length - 3);
                  }
                },
              });
            }
          })
          .catch(() => {});
      }}
    />
  )
);

export default App;
