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
        <div
          className="hastebin-button"
          onClick={async () => {
            let mywindow = window.open(
              "",
              "PRINT",
              "height=650,width=900,top=100,left=150"
            );

            if (!mywindow) return;

            mywindow.document.write(
              `<html>
              <head>
              <title>${currentFileName}</title>
              <link rel="stylesheet" href="fonts/fonts.css" />
              <style>
              body {
                width: 100%;
                height: 100%;
                font-family: 'Computer Modern Serif', 'Noto Serif CJK KR', serif;
                line-height: 1.8;
                font-size: 1.05rem;
              }
              p {
                margin: .4rem 0!important;
              }
              a {
                font-family: 'Computer Modern Typewriter', monospace;
              }
              .katex {
                font-size: 1.05em !important;
              }
              .text-align-center {
                text-align: center;
              }
              img {
                max-width: 100%;
              }
              @font-face{font-family:KaTeX_AMS;src:url(/static/media/KaTeX_AMS-Regular.e78e28b4.woff2) format("woff2"),url(/static/media/KaTeX_AMS-Regular.7f06b4e3.woff) format("woff"),url(/static/media/KaTeX_AMS-Regular.aaf4eee9.ttf) format("truetype");font-weight:400;font-style:normal}@font-face{font-family:KaTeX_Caligraphic;src:url(/static/media/KaTeX_Caligraphic-Bold.4ec58bef.woff2) format("woff2"),url(/static/media/KaTeX_Caligraphic-Bold.1e802ca9.woff) format("woff"),url(/static/media/KaTeX_Caligraphic-Bold.021dd4dc.ttf) format("truetype");font-weight:700;font-style:normal}@font-face{font-family:KaTeX_Caligraphic;src:url(/static/media/KaTeX_Caligraphic-Regular.7edb53b6.woff2) format("woff2"),url(/static/media/KaTeX_Caligraphic-Regular.d3b46c3a.woff) format("woff"),url(/static/media/KaTeX_Caligraphic-Regular.d49f2d55.ttf) format("truetype");font-weight:400;font-style:normal}@font-face{font-family:KaTeX_Fraktur;src:url(/static/media/KaTeX_Fraktur-Bold.d5b59ec9.woff2) format("woff2"),url(/static/media/KaTeX_Fraktur-Bold.c4c8cab7.woff) format("woff"),url(/static/media/KaTeX_Fraktur-Bold.a31e7cba.ttf) format("truetype");font-weight:700;font-style:normal}@font-face{font-family:KaTeX_Fraktur;src:url(/static/media/KaTeX_Fraktur-Regular.32a5339e.woff2) format("woff2"),url(/static/media/KaTeX_Fraktur-Regular.b7d9c46b.woff) format("woff"),url(/static/media/KaTeX_Fraktur-Regular.a48dad4f.ttf) format("truetype");font-weight:400;font-style:normal}@font-face{font-family:KaTeX_Main;src:url(/static/media/KaTeX_Main-Bold.8e1e01c4.woff2) format("woff2"),url(/static/media/KaTeX_Main-Bold.22086eb5.woff) format("woff"),url(/static/media/KaTeX_Main-Bold.9ceff51b.ttf) format("truetype");font-weight:700;font-style:normal}@font-face{font-family:KaTeX_Main;src:url(/static/media/KaTeX_Main-BoldItalic.284a17fe.woff2) format("woff2"),url(/static/media/KaTeX_Main-BoldItalic.4c57dbc4.woff) format("woff"),url(/static/media/KaTeX_Main-BoldItalic.e8b44b99.ttf) format("truetype");font-weight:700;font-style:italic}@font-face{font-family:KaTeX_Main;src:url(/static/media/KaTeX_Main-Italic.e533d5a2.woff2) format("woff2"),url(/static/media/KaTeX_Main-Italic.99be0e10.woff) format("woff"),url(/static/media/KaTeX_Main-Italic.29c86397.ttf) format("truetype");font-weight:400;font-style:italic}@font-face{font-family:KaTeX_Main;src:url(/static/media/KaTeX_Main-Regular.5c734d78.woff2) format("woff2"),url(/static/media/KaTeX_Main-Regular.b741441f.woff) format("woff"),url(/static/media/KaTeX_Main-Regular.5c94aef4.ttf) format("truetype");font-weight:400;font-style:normal}@font-face{font-family:KaTeX_Math;src:url(/static/media/KaTeX_Math-BoldItalic.d747bd1e.woff2) format("woff2"),url(/static/media/KaTeX_Math-BoldItalic.b13731ef.woff) format("woff"),url(/static/media/KaTeX_Math-BoldItalic.9a2834a9.ttf) format("truetype");font-weight:700;font-style:italic}@font-face{font-family:KaTeX_Math;src:url(/static/media/KaTeX_Math-Italic.4ad08b82.woff2) format("woff2"),url(/static/media/KaTeX_Math-Italic.f0303906.woff) format("woff"),url(/static/media/KaTeX_Math-Italic.291e76b8.ttf) format("truetype");font-weight:400;font-style:italic}@font-face{font-family:"KaTeX_SansSerif";src:url(/static/media/KaTeX_SansSerif-Bold.6e0830be.woff2) format("woff2"),url(/static/media/KaTeX_SansSerif-Bold.3fb41955.woff) format("woff"),url(/static/media/KaTeX_SansSerif-Bold.7dc027cb.ttf) format("truetype");font-weight:700;font-style:normal}@font-face{font-family:"KaTeX_SansSerif";src:url(/static/media/KaTeX_SansSerif-Italic.fba01c9c.woff2) format("woff2"),url(/static/media/KaTeX_SansSerif-Italic.727a9b0d.woff) format("woff"),url(/static/media/KaTeX_SansSerif-Italic.4059868e.ttf) format("truetype");font-weight:400;font-style:italic}@font-face{font-family:"KaTeX_SansSerif";src:url(/static/media/KaTeX_SansSerif-Regular.d929cd67.woff2) format("woff2"),url(/static/media/KaTeX_SansSerif-Regular.2555754a.woff) format("woff"),url(/static/media/KaTeX_SansSerif-Regular.5c58d168.ttf) format("truetype");font-weight:400;font-style:normal}@font-face{font-family:KaTeX_Script;src:url(/static/media/KaTeX_Script-Regular.755e2491.woff2) format("woff2"),url(/static/media/KaTeX_Script-Regular.d524c9a5.woff) format("woff"),url(/static/media/KaTeX_Script-Regular.d12ea9ef.ttf) format("truetype");font-weight:400;font-style:normal}@font-face{font-family:KaTeX_Size1;src:url(/static/media/KaTeX_Size1-Regular.048c39cb.woff2) format("woff2"),url(/static/media/KaTeX_Size1-Regular.08b5f00e.woff) format("woff"),url(/static/media/KaTeX_Size1-Regular.7342d45b.ttf) format("truetype");font-weight:400;font-style:normal}@font-face{font-family:KaTeX_Size2;src:url(/static/media/KaTeX_Size2-Regular.81d6b8d5.woff2) format("woff2"),url(/static/media/KaTeX_Size2-Regular.af24b0e4.woff) format("woff"),url(/static/media/KaTeX_Size2-Regular.eb130dcc.ttf) format("truetype");font-weight:400;font-style:normal}@font-face{font-family:KaTeX_Size3;src:url(/static/media/KaTeX_Size3-Regular.b311ca09.woff2) format("woff2"),url(/static/media/KaTeX_Size3-Regular.0d892640.woff) format("woff"),url(/static/media/KaTeX_Size3-Regular.7e02a40c.ttf) format("truetype");font-weight:400;font-style:normal}@font-face{font-family:KaTeX_Size4;src:url(/static/media/KaTeX_Size4-Regular.6a3255df.woff2) format("woff2"),url(/static/media/KaTeX_Size4-Regular.68895bb8.woff) format("woff"),url(/static/media/KaTeX_Size4-Regular.ad767252.ttf) format("truetype");font-weight:400;font-style:normal}@font-face{font-family:KaTeX_Typewriter;src:url(/static/media/KaTeX_Typewriter-Regular.6cc31ea5.woff2) format("woff2"),url(/static/media/KaTeX_Typewriter-Regular.3fe216d2.woff) format("woff"),url(/static/media/KaTeX_Typewriter-Regular.25702356.ttf) format("truetype");font-weight:400;font-style:normal}.katex{font:normal 1.21em KaTeX_Main,Times New Roman,serif;line-height:1.2;text-indent:0;text-rendering:auto}.katex *{-ms-high-contrast-adjust:none!important}.katex .katex-version:after{content:"0.11.1"}.katex .katex-mathml{position:absolute;clip:rect(1px,1px,1px,1px);padding:0;border:0;height:1px;width:1px;overflow:hidden}.katex .katex-html>.newline{display:block}.katex .base{position:relative;white-space:nowrap;width:min-content}.katex .base,.katex .strut{display:inline-block}.katex .textbf{font-weight:700}.katex .textit{font-style:italic}.katex .textrm{font-family:KaTeX_Main}.katex .textsf{font-family:KaTeX_SansSerif}.katex .texttt{font-family:KaTeX_Typewriter}.katex .mathdefault{font-family:KaTeX_Math;font-style:italic}.katex .mathit{font-family:KaTeX_Main;font-style:italic}.katex .mathrm{font-style:normal}.katex .mathbf{font-family:KaTeX_Main;font-weight:700}.katex .boldsymbol{font-family:KaTeX_Math;font-weight:700;font-style:italic}.katex .amsrm,.katex .mathbb,.katex .textbb{font-family:KaTeX_AMS}.katex .mathcal{font-family:KaTeX_Caligraphic}.katex .mathfrak,.katex .textfrak{font-family:KaTeX_Fraktur}.katex .mathtt{font-family:KaTeX_Typewriter}.katex .mathscr,.katex .textscr{font-family:KaTeX_Script}.katex .mathsf,.katex .textsf{font-family:KaTeX_SansSerif}.katex .mathboldsf,.katex .textboldsf{font-family:KaTeX_SansSerif;font-weight:700}.katex .mathitsf,.katex .textitsf{font-family:KaTeX_SansSerif;font-style:italic}.katex .mainrm{font-family:KaTeX_Main;font-style:normal}.katex .vlist-t{display:inline-table;table-layout:fixed}.katex .vlist-r{display:table-row}.katex .vlist{display:table-cell;vertical-align:bottom;position:relative}.katex .vlist>span{display:block;height:0;position:relative}.katex .vlist>span>span{display:inline-block}.katex .vlist>span>.pstrut{overflow:hidden;width:0}.katex .vlist-t2{margin-right:-2px}.katex .vlist-s{display:table-cell;vertical-align:bottom;font-size:1px;width:2px;min-width:2px}.katex .msupsub{text-align:left}.katex .mfrac>span>span{text-align:center}.katex .mfrac .frac-line{display:inline-block;width:100%;border-bottom-style:solid}.katex .hdashline,.katex .hline,.katex .mfrac .frac-line,.katex .overline .overline-line,.katex .rule,.katex .underline .underline-line{min-height:1px}.katex .mspace{display:inline-block}.katex .clap,.katex .llap,.katex .rlap{width:0;position:relative}.katex .clap>.inner,.katex .llap>.inner,.katex .rlap>.inner{position:absolute}.katex .clap>.fix,.katex .llap>.fix,.katex .rlap>.fix{display:inline-block}.katex .llap>.inner{right:0}.katex .clap>.inner,.katex .rlap>.inner{left:0}.katex .clap>.inner>span{margin-left:-50%;margin-right:50%}.katex .rule{display:inline-block;border:0 solid;position:relative}.katex .hline,.katex .overline .overline-line,.katex .underline .underline-line{display:inline-block;width:100%;border-bottom-style:solid}.katex .hdashline{display:inline-block;width:100%;border-bottom-style:dashed}.katex .sqrt>.root{margin-left:.27777778em;margin-right:-.55555556em}.katex .fontsize-ensurer.reset-size1.size1,.katex .sizing.reset-size1.size1{font-size:1em}.katex .fontsize-ensurer.reset-size1.size2,.katex .sizing.reset-size1.size2{font-size:1.2em}.katex .fontsize-ensurer.reset-size1.size3,.katex .sizing.reset-size1.size3{font-size:1.4em}.katex .fontsize-ensurer.reset-size1.size4,.katex .sizing.reset-size1.size4{font-size:1.6em}.katex .fontsize-ensurer.reset-size1.size5,.katex .sizing.reset-size1.size5{font-size:1.8em}.katex .fontsize-ensurer.reset-size1.size6,.katex .sizing.reset-size1.size6{font-size:2em}.katex .fontsize-ensurer.reset-size1.size7,.katex .sizing.reset-size1.size7{font-size:2.4em}.katex .fontsize-ensurer.reset-size1.size8,.katex .sizing.reset-size1.size8{font-size:2.88em}.katex .fontsize-ensurer.reset-size1.size9,.katex .sizing.reset-size1.size9{font-size:3.456em}.katex .fontsize-ensurer.reset-size1.size10,.katex .sizing.reset-size1.size10{font-size:4.148em}.katex .fontsize-ensurer.reset-size1.size11,.katex .sizing.reset-size1.size11{font-size:4.976em}.katex .fontsize-ensurer.reset-size2.size1,.katex .sizing.reset-size2.size1{font-size:.83333333em}.katex .fontsize-ensurer.reset-size2.size2,.katex .sizing.reset-size2.size2{font-size:1em}.katex .fontsize-ensurer.reset-size2.size3,.katex .sizing.reset-size2.size3{font-size:1.16666667em}.katex .fontsize-ensurer.reset-size2.size4,.katex .sizing.reset-size2.size4{font-size:1.33333333em}.katex .fontsize-ensurer.reset-size2.size5,.katex .sizing.reset-size2.size5{font-size:1.5em}.katex .fontsize-ensurer.reset-size2.size6,.katex .sizing.reset-size2.size6{font-size:1.66666667em}.katex .fontsize-ensurer.reset-size2.size7,.katex .sizing.reset-size2.size7{font-size:2em}.katex .fontsize-ensurer.reset-size2.size8,.katex .sizing.reset-size2.size8{font-size:2.4em}.katex .fontsize-ensurer.reset-size2.size9,.katex .sizing.reset-size2.size9{font-size:2.88em}.katex .fontsize-ensurer.reset-size2.size10,.katex .sizing.reset-size2.size10{font-size:3.45666667em}.katex .fontsize-ensurer.reset-size2.size11,.katex .sizing.reset-size2.size11{font-size:4.14666667em}.katex .fontsize-ensurer.reset-size3.size1,.katex .sizing.reset-size3.size1{font-size:.71428571em}.katex .fontsize-ensurer.reset-size3.size2,.katex .sizing.reset-size3.size2{font-size:.85714286em}.katex .fontsize-ensurer.reset-size3.size3,.katex .sizing.reset-size3.size3{font-size:1em}.katex .fontsize-ensurer.reset-size3.size4,.katex .sizing.reset-size3.size4{font-size:1.14285714em}.katex .fontsize-ensurer.reset-size3.size5,.katex .sizing.reset-size3.size5{font-size:1.28571429em}.katex .fontsize-ensurer.reset-size3.size6,.katex .sizing.reset-size3.size6{font-size:1.42857143em}.katex .fontsize-ensurer.reset-size3.size7,.katex .sizing.reset-size3.size7{font-size:1.71428571em}.katex .fontsize-ensurer.reset-size3.size8,.katex .sizing.reset-size3.size8{font-size:2.05714286em}.katex .fontsize-ensurer.reset-size3.size9,.katex .sizing.reset-size3.size9{font-size:2.46857143em}.katex .fontsize-ensurer.reset-size3.size10,.katex .sizing.reset-size3.size10{font-size:2.96285714em}.katex .fontsize-ensurer.reset-size3.size11,.katex .sizing.reset-size3.size11{font-size:3.55428571em}.katex .fontsize-ensurer.reset-size4.size1,.katex .sizing.reset-size4.size1{font-size:.625em}.katex .fontsize-ensurer.reset-size4.size2,.katex .sizing.reset-size4.size2{font-size:.75em}.katex .fontsize-ensurer.reset-size4.size3,.katex .sizing.reset-size4.size3{font-size:.875em}.katex .fontsize-ensurer.reset-size4.size4,.katex .sizing.reset-size4.size4{font-size:1em}.katex .fontsize-ensurer.reset-size4.size5,.katex .sizing.reset-size4.size5{font-size:1.125em}.katex .fontsize-ensurer.reset-size4.size6,.katex .sizing.reset-size4.size6{font-size:1.25em}.katex .fontsize-ensurer.reset-size4.size7,.katex .sizing.reset-size4.size7{font-size:1.5em}.katex .fontsize-ensurer.reset-size4.size8,.katex .sizing.reset-size4.size8{font-size:1.8em}.katex .fontsize-ensurer.reset-size4.size9,.katex .sizing.reset-size4.size9{font-size:2.16em}.katex .fontsize-ensurer.reset-size4.size10,.katex .sizing.reset-size4.size10{font-size:2.5925em}.katex .fontsize-ensurer.reset-size4.size11,.katex .sizing.reset-size4.size11{font-size:3.11em}.katex .fontsize-ensurer.reset-size5.size1,.katex .sizing.reset-size5.size1{font-size:.55555556em}.katex .fontsize-ensurer.reset-size5.size2,.katex .sizing.reset-size5.size2{font-size:.66666667em}.katex .fontsize-ensurer.reset-size5.size3,.katex .sizing.reset-size5.size3{font-size:.77777778em}.katex .fontsize-ensurer.reset-size5.size4,.katex .sizing.reset-size5.size4{font-size:.88888889em}.katex .fontsize-ensurer.reset-size5.size5,.katex .sizing.reset-size5.size5{font-size:1em}.katex .fontsize-ensurer.reset-size5.size6,.katex .sizing.reset-size5.size6{font-size:1.11111111em}.katex .fontsize-ensurer.reset-size5.size7,.katex .sizing.reset-size5.size7{font-size:1.33333333em}.katex .fontsize-ensurer.reset-size5.size8,.katex .sizing.reset-size5.size8{font-size:1.6em}.katex .fontsize-ensurer.reset-size5.size9,.katex .sizing.reset-size5.size9{font-size:1.92em}.katex .fontsize-ensurer.reset-size5.size10,.katex .sizing.reset-size5.size10{font-size:2.30444444em}.katex .fontsize-ensurer.reset-size5.size11,.katex .sizing.reset-size5.size11{font-size:2.76444444em}.katex .fontsize-ensurer.reset-size6.size1,.katex .sizing.reset-size6.size1{font-size:.5em}.katex .fontsize-ensurer.reset-size6.size2,.katex .sizing.reset-size6.size2{font-size:.6em}.katex .fontsize-ensurer.reset-size6.size3,.katex .sizing.reset-size6.size3{font-size:.7em}.katex .fontsize-ensurer.reset-size6.size4,.katex .sizing.reset-size6.size4{font-size:.8em}.katex .fontsize-ensurer.reset-size6.size5,.katex .sizing.reset-size6.size5{font-size:.9em}.katex .fontsize-ensurer.reset-size6.size6,.katex .sizing.reset-size6.size6{font-size:1em}.katex .fontsize-ensurer.reset-size6.size7,.katex .sizing.reset-size6.size7{font-size:1.2em}.katex .fontsize-ensurer.reset-size6.size8,.katex .sizing.reset-size6.size8{font-size:1.44em}.katex .fontsize-ensurer.reset-size6.size9,.katex .sizing.reset-size6.size9{font-size:1.728em}.katex .fontsize-ensurer.reset-size6.size10,.katex .sizing.reset-size6.size10{font-size:2.074em}.katex .fontsize-ensurer.reset-size6.size11,.katex .sizing.reset-size6.size11{font-size:2.488em}.katex .fontsize-ensurer.reset-size7.size1,.katex .sizing.reset-size7.size1{font-size:.41666667em}.katex .fontsize-ensurer.reset-size7.size2,.katex .sizing.reset-size7.size2{font-size:.5em}.katex .fontsize-ensurer.reset-size7.size3,.katex .sizing.reset-size7.size3{font-size:.58333333em}.katex .fontsize-ensurer.reset-size7.size4,.katex .sizing.reset-size7.size4{font-size:.66666667em}.katex .fontsize-ensurer.reset-size7.size5,.katex .sizing.reset-size7.size5{font-size:.75em}.katex .fontsize-ensurer.reset-size7.size6,.katex .sizing.reset-size7.size6{font-size:.83333333em}.katex .fontsize-ensurer.reset-size7.size7,.katex .sizing.reset-size7.size7{font-size:1em}.katex .fontsize-ensurer.reset-size7.size8,.katex .sizing.reset-size7.size8{font-size:1.2em}.katex .fontsize-ensurer.reset-size7.size9,.katex .sizing.reset-size7.size9{font-size:1.44em}.katex .fontsize-ensurer.reset-size7.size10,.katex .sizing.reset-size7.size10{font-size:1.72833333em}.katex .fontsize-ensurer.reset-size7.size11,.katex .sizing.reset-size7.size11{font-size:2.07333333em}.katex .fontsize-ensurer.reset-size8.size1,.katex .sizing.reset-size8.size1{font-size:.34722222em}.katex .fontsize-ensurer.reset-size8.size2,.katex .sizing.reset-size8.size2{font-size:.41666667em}.katex .fontsize-ensurer.reset-size8.size3,.katex .sizing.reset-size8.size3{font-size:.48611111em}.katex .fontsize-ensurer.reset-size8.size4,.katex .sizing.reset-size8.size4{font-size:.55555556em}.katex .fontsize-ensurer.reset-size8.size5,.katex .sizing.reset-size8.size5{font-size:.625em}.katex .fontsize-ensurer.reset-size8.size6,.katex .sizing.reset-size8.size6{font-size:.69444444em}.katex .fontsize-ensurer.reset-size8.size7,.katex .sizing.reset-size8.size7{font-size:.83333333em}.katex .fontsize-ensurer.reset-size8.size8,.katex .sizing.reset-size8.size8{font-size:1em}.katex .fontsize-ensurer.reset-size8.size9,.katex .sizing.reset-size8.size9{font-size:1.2em}.katex .fontsize-ensurer.reset-size8.size10,.katex .sizing.reset-size8.size10{font-size:1.44027778em}.katex .fontsize-ensurer.reset-size8.size11,.katex .sizing.reset-size8.size11{font-size:1.72777778em}.katex .fontsize-ensurer.reset-size9.size1,.katex .sizing.reset-size9.size1{font-size:.28935185em}.katex .fontsize-ensurer.reset-size9.size2,.katex .sizing.reset-size9.size2{font-size:.34722222em}.katex .fontsize-ensurer.reset-size9.size3,.katex .sizing.reset-size9.size3{font-size:.40509259em}.katex .fontsize-ensurer.reset-size9.size4,.katex .sizing.reset-size9.size4{font-size:.46296296em}.katex .fontsize-ensurer.reset-size9.size5,.katex .sizing.reset-size9.size5{font-size:.52083333em}.katex .fontsize-ensurer.reset-size9.size6,.katex .sizing.reset-size9.size6{font-size:.5787037em}.katex .fontsize-ensurer.reset-size9.size7,.katex .sizing.reset-size9.size7{font-size:.69444444em}.katex .fontsize-ensurer.reset-size9.size8,.katex .sizing.reset-size9.size8{font-size:.83333333em}.katex .fontsize-ensurer.reset-size9.size9,.katex .sizing.reset-size9.size9{font-size:1em}.katex .fontsize-ensurer.reset-size9.size10,.katex .sizing.reset-size9.size10{font-size:1.20023148em}.katex .fontsize-ensurer.reset-size9.size11,.katex .sizing.reset-size9.size11{font-size:1.43981481em}.katex .fontsize-ensurer.reset-size10.size1,.katex .sizing.reset-size10.size1{font-size:.24108004em}.katex .fontsize-ensurer.reset-size10.size2,.katex .sizing.reset-size10.size2{font-size:.28929605em}.katex .fontsize-ensurer.reset-size10.size3,.katex .sizing.reset-size10.size3{font-size:.33751205em}.katex .fontsize-ensurer.reset-size10.size4,.katex .sizing.reset-size10.size4{font-size:.38572806em}.katex .fontsize-ensurer.reset-size10.size5,.katex .sizing.reset-size10.size5{font-size:.43394407em}.katex .fontsize-ensurer.reset-size10.size6,.katex .sizing.reset-size10.size6{font-size:.48216008em}.katex .fontsize-ensurer.reset-size10.size7,.katex .sizing.reset-size10.size7{font-size:.57859209em}.katex .fontsize-ensurer.reset-size10.size8,.katex .sizing.reset-size10.size8{font-size:.69431051em}.katex .fontsize-ensurer.reset-size10.size9,.katex .sizing.reset-size10.size9{font-size:.83317261em}.katex .fontsize-ensurer.reset-size10.size10,.katex .sizing.reset-size10.size10{font-size:1em}.katex .fontsize-ensurer.reset-size10.size11,.katex .sizing.reset-size10.size11{font-size:1.19961427em}.katex .fontsize-ensurer.reset-size11.size1,.katex .sizing.reset-size11.size1{font-size:.20096463em}.katex .fontsize-ensurer.reset-size11.size2,.katex .sizing.reset-size11.size2{font-size:.24115756em}.katex .fontsize-ensurer.reset-size11.size3,.katex .sizing.reset-size11.size3{font-size:.28135048em}.katex .fontsize-ensurer.reset-size11.size4,.katex .sizing.reset-size11.size4{font-size:.32154341em}.katex .fontsize-ensurer.reset-size11.size5,.katex .sizing.reset-size11.size5{font-size:.36173633em}.katex .fontsize-ensurer.reset-size11.size6,.katex .sizing.reset-size11.size6{font-size:.40192926em}.katex .fontsize-ensurer.reset-size11.size7,.katex .sizing.reset-size11.size7{font-size:.48231511em}.katex .fontsize-ensurer.reset-size11.size8,.katex .sizing.reset-size11.size8{font-size:.57877814em}.katex .fontsize-ensurer.reset-size11.size9,.katex .sizing.reset-size11.size9{font-size:.69453376em}.katex .fontsize-ensurer.reset-size11.size10,.katex .sizing.reset-size11.size10{font-size:.83360129em}.katex .fontsize-ensurer.reset-size11.size11,.katex .sizing.reset-size11.size11{font-size:1em}.katex .delimsizing.size1{font-family:KaTeX_Size1}.katex .delimsizing.size2{font-family:KaTeX_Size2}.katex .delimsizing.size3{font-family:KaTeX_Size3}.katex .delimsizing.size4{font-family:KaTeX_Size4}.katex .delimsizing.mult .delim-size1>span{font-family:KaTeX_Size1}.katex .delimsizing.mult .delim-size4>span{font-family:KaTeX_Size4}.katex .nulldelimiter{display:inline-block;width:.12em}.katex .delimcenter,.katex .op-symbol{position:relative}.katex .op-symbol.small-op{font-family:KaTeX_Size1}.katex .op-symbol.large-op{font-family:KaTeX_Size2}.katex .op-limits>.vlist-t{text-align:center}.katex .accent>.vlist-t{text-align:center}.katex .accent .accent-body{position:relative}.katex .accent .accent-body:not(.accent-full){width:0}.katex .overlay{display:block}.katex .mtable .vertical-separator{display:inline-block;min-width:1px}.katex .mtable .arraycolsep{display:inline-block}.katex .mtable .col-align-c>.vlist-t{text-align:center}.katex .mtable .col-align-l>.vlist-t{text-align:left}.katex .mtable .col-align-r>.vlist-t{text-align:right}.katex .svg-align{text-align:left}.katex svg{display:block;position:absolute;width:100%;height:inherit;fill:currentColor;stroke:currentColor;fill-rule:nonzero;fill-opacity:1;stroke-width:1;stroke-linecap:butt;stroke-linejoin:miter;stroke-miterlimit:4;stroke-dasharray:none;stroke-dashoffset:0;stroke-opacity:1}.katex svg path{stroke:none}.katex img{border-style:none;min-width:0;min-height:0;max-width:none;max-height:none}.katex .stretchy{width:100%;display:block;position:relative;overflow:hidden}.katex .stretchy:after,.katex .stretchy:before{content:""}.katex .hide-tail{width:100%;position:relative;overflow:hidden}.katex .halfarrow-left{position:absolute;left:0;width:50.2%;overflow:hidden}.katex .halfarrow-right{position:absolute;right:0;width:50.2%;overflow:hidden}.katex .brace-left{position:absolute;left:0;width:25.1%;overflow:hidden}.katex .brace-center{position:absolute;left:25%;width:50%;overflow:hidden}.katex .brace-right{position:absolute;right:0;width:25.1%;overflow:hidden}.katex .x-arrow-pad{padding:0 .5em}.katex .mover,.katex .munder,.katex .x-arrow{text-align:center}.katex .boxpad{padding:0 .3em}.katex .fbox,.katex .fcolorbox{box-sizing:border-box;border:.04em solid}.katex .cancel-pad{padding:0 .2em}.katex .cancel-lap{margin-left:-.2em;margin-right:-.2em}.katex .sout{border-bottom-style:solid;border-bottom-width:.08em}.katex-display{display:block;margin:1em 0;text-align:center}.katex-display>.katex{display:block;text-align:center;white-space:nowrap}.katex-display>.katex>.katex-html{display:block;position:relative}.katex-display>.katex>.katex-html>.tag{position:absolute;right:0}.katex-display.leqno>.katex>.katex-html>.tag{left:0;right:auto}.katex-display.fleqn>.katex{text-align:left}
              </style>
              <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.12.0/dist/katex.min.css" integrity="sha384-AfEj0r4/OFrOo5t7NnNe46zW/tFgW6x/bCJG8FqQCEo3+Aro6EYUG4+cU+KJWu/X" crossorigin="anonymous">
              <!-- The loading of KaTeX is deferred to speed up page rendering -->
              <script defer src="https://cdn.jsdelivr.net/npm/katex@0.12.0/dist/katex.min.js" integrity="sha384-g7c+Jr9ZivxKLnZTDUhnkOnsh30B4H0rpLUpJ4jAIKs4fnJI+sEnkvrMWph2EDg4" crossorigin="anonymous"></script>
              <!-- To automatically render math in text elements, include the auto-render extension: -->
              <script defer src="https://cdn.jsdelivr.net/npm/katex@0.12.0/dist/contrib/auto-render.min.js" integrity="sha384-mll67QQFJfxn0IYznZYonOWZ644AWYC+Pt2cHqMaRhXVrursRwvLnLaebdGIlYNa" crossorigin="anonymous"
                  onload="renderMathInElement(document.body);"></script>`
            );
            mywindow.document.write("</head><body>");
            mywindow.document.write(
              document.getElementById("renderer")!.innerHTML
            );
            mywindow.document.write("</body></html>");

            mywindow.document.close();
            mywindow.focus();

            function sleep(ms: number) {
              return new Promise((resolve) => setTimeout(resolve, ms));
            }

            await sleep(2000);

            mywindow.print();
            mywindow.close();

            return true;
          }}
        >
          Print
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
