import React, { useEffect, useState } from "react";
import "./App.css";

import * as IncrementalDOM from "incremental-dom";
import MarkdownIt from "markdown-it";
import MarkdownItKaTeX from "./utils/markdown-it-katex";
import MarkdownItIncrementalDOM from "markdown-it-incremental-dom";

import ace from "ace-builds";
import AceEditor from "react-ace-builds";
import "ace-builds/src-noconflict/mode-latex";
import "ace-builds/src-noconflict/theme-github";

import "katex/dist/katex.min.js";
import "katex/dist/katex.min.css";

/* eslint import/no-webpack-loader-syntax: off */
ace.config.setModuleUrl(
  "ace/mode/latex",
  require("file-loader?esModule=false!ace-builds/src-min-noconflict/mode-latex.js"),
);
ace.config.setModuleUrl(
  "ace/theme/github",
  require("file-loader?esModule=false!ace-builds/src-min-noconflict/theme-github.js"),
);

const md = new MarkdownIt()
  .use(MarkdownItIncrementalDOM, IncrementalDOM)
  .use(MarkdownItKaTeX);

const MIN_WIDTH_FACTOR = 0.15;
const MAX_WIDTH_FACTOR = 1 - MIN_WIDTH_FACTOR;

function App() {
  const [content, setContent] = useState<string>("");
  const [widthFactor, setWidthFactor] = useState<number>(0.5);
  const [isDragging, setDragging] = useState<boolean>(false);

  useEffect(() => {
    IncrementalDOM.patch(
      document.getElementById("renderer")!,
      (md as any).renderToIncrementalDOM(content),
    );
  }, [content]);

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
              MAX_WIDTH_FACTOR,
            ),
          );
        }
      }}
      onMouseUp={() => setDragging(false)}
      onMouseLeave={() => setDragging(false)}
    >
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
        }}
      >
        <AceEditor
          mode="latex"
          theme="github"
          onChange={setContent}
          value={content}
          width={`${widthFactor * 100}%`}
          height="100%"
          editorProps={{ $blockScrolling: true }}
          style={{
            boxSizing: "border-box",
            paddingRight: 3,
          }}
        />
        <div
          id="renderer"
          style={{
            width: `${(1 - widthFactor) * 100}%`,
            height: "100%",
            boxSizing: "border-box",
            paddingLeft: 3,
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
