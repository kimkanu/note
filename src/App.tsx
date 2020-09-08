import React, { useEffect, useState } from "react";
import "./App.css";

import * as IncrementalDOM from "incremental-dom";
import MarkdownIt from "markdown-it";
import MarkdownItKaTeX from "./utils/markdown-it-katex";
import MarkdownItIncrementalDOM from "markdown-it-incremental-dom";

import Creatable from "react-select/creatable";

import ace from "ace-builds";
import AceEditor from "react-ace-builds";
import "ace-builds/src-noconflict/mode-latex";
import "ace-builds/src-noconflict/theme-github";

import "katex/dist/katex.min.js";
import "katex/dist/katex.min.css";
import { FileSystem } from "./models/FileSystem";

/* eslint import/no-webpack-loader-syntax: off */
ace.config.setModuleUrl(
  "ace/mode/latex",
  require("file-loader?esModule=false!ace-builds/src-min-noconflict/mode-latex.js")
);
ace.config.setModuleUrl(
  "ace/theme/github",
  require("file-loader?esModule=false!ace-builds/src-min-noconflict/theme-github.js")
);

const md = new MarkdownIt()
  .use(MarkdownItIncrementalDOM, IncrementalDOM)
  .use(MarkdownItKaTeX);

const MIN_WIDTH_FACTOR = 0.15;
const MAX_WIDTH_FACTOR = 1 - MIN_WIDTH_FACTOR;

const fileSystem = new FileSystem();

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

  useEffect(() => {
    IncrementalDOM.patch(
      document.getElementById("renderer")!,
      (md as any).renderToIncrementalDOM(content)
    );
    if (currentFileName) {
      fileSystem.updateFile(currentFileName, content);
    }
  }, [content, currentFileName]);

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
      onMouseUp={() => setDragging(false)}
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
              console.log(value, action);
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
              "https://hastebin.com/about"
            );
            if (keyOrUrl === null) {
              return;
            }
            let key = keyOrUrl;
            if (keyOrUrl.includes("hastebin.com/")) {
              const matches = keyOrUrl.match(/(?<=hastebin.com\/)[^.]*/);
              if (!matches) {
                return;
              }
              key = matches[0];
            }

            setImportButtonText("Importing...");
            const url = `https://cors-anywhere.herokuapp.com/https://hastebin.com/raw/${key}`;
            try {
              const filename = `hastebin:${key}`;
              const content = await (await fetch(url)).text();
              fileSystem.createFile(filename);
              fileSystem.updateFile(filename, content);
              setFileList(Array.from(fileSystem.index));
              setCurrentFileName(filename);
              fileSystem.setCurrent(filename);
              setContent(content);
              setImportButtonText("Import from Hastebin");
            } catch (e) {
              console.log(e);
              setImportButtonText(e.toString());
              return;
            }
          }}
        >
          {importButtonText}
        </div>
        <div
          className="hastebin-button"
          onClick={async () => {
            if (currentFileName?.startsWith("hastebin:")) {
              const key = currentFileName.slice("hastebin:".length);
              window.open(`https://hastebin.com/${key}.md`);
              return;
            }
            if (exportButtonText === "Exporting...") return;
            if (content === "") return;

            setExportButtonText("Exporting...");
            const url =
              "https://cors-anywhere.herokuapp.com/https://hastebin.com/documents";
            try {
              const { key }: { key: string } = await (
                await fetch(url, { method: "POST", body: content })
              ).json();
              window.open(`https://hastebin.com/${key}.md`);
              setExportButtonText("Export to Hastebin");

              const filename = `hastebin:${key}`;
              fileSystem.createFile(filename);
              fileSystem.updateFile(filename, content);
              setFileList(Array.from(fileSystem.index));
              setCurrentFileName(filename);
              fileSystem.setCurrent(filename);
              setContent(content);
            } catch (e) {
              console.log(e);
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
          <AceEditor
            mode="latex"
            theme="github"
            onChange={setContent}
            value={content}
            width="100%"
            height="100%"
            editorProps={{ $blockScrolling: true }}
            wrapEnabled
            style={{
              borderRadius: "0.75rem",
              boxShadow:
                "0 10px 20px rgba(0,0,0,0.19), 0 6px 6px rgba(0,0,0,0.23)",
            }}
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
        ></div>
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

export default App;
