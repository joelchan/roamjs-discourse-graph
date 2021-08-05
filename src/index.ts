import {
  addStyle,
  createButtonObserver,
  createHTMLObserver,
  getDisplayNameByUid,
  getPageTitleByHtmlElement,
  toConfig,
} from "roam-client";
import { createConfigObserver } from "roamjs-components";
import { render } from "./NodeMenu";
import { render as exportRender } from "./ExportDialog";
import { render as synthesisRender } from "./SynthesisQuery";
import { render as contextRender } from "./DiscourseContext";
import { render as cyRender } from "./CytoscapePlayground";
import { render as previewRender } from "./LivePreview";
import {
  DEFAULT_NODE_VALUES,
  DEFAULT_RELATION_VALUES,
  isFlagEnabled,
  NODE_TITLE_REGEX,
  refreshConfigTree,
} from "./util";
import { NodeConfigPanel, RelationConfigPanel } from "./ConfigPanels";

addStyle(`.roamjs-discourse-live-preview>div>.rm-block-main,.roamjs-discourse-live-preview>div>.rm-inline-references {
  display: none;
}

.roamjs-discourse-live-preview>div>.rm-block-children {
  margin-left: -4px;
}

.roamjs-discourse-live-preview>div>.rm-block-children>.rm-multibar {
  display: none;
}

.roamjs-discourse-live-preview {
  overflow-y: scroll;
}

.roamjs-discourse-context-title { 
  font-size: 16px;
  color: #106ba3;
  cursor: pointer; 
}

.roamjs-discourse-context-title:hover { 
  text-decoration: underline;
}

.roamjs-discourse-config-label {
  flex-grow: 1;
}

.roamjs-discourse-edit-relations {
  border: 1px solid gray;
  border-bottom-left-radius: 16px;
  border-bottom-right-radius: 16px;
  height: 400px;
  width: 100%;
  position: relative;
}

.roamjs-discourse-edit-relations:focus {
  outline: none;
}

.roamjs-discourse-playground-drawer > .bp3-overlay {
  pointer-events: none;
}

div.roamjs-discourse-playground-drawer div.bp3-drawer {
  pointer-events: all;
  width: 40%;
}`);

const CONFIG = toConfig("discourse-graph");

const { pageUid } = createConfigObserver({
  title: CONFIG,
  config: {
    tabs: [
      { id: "preview", fields: [], toggleable: true },
      {
        id: "grammar",
        fields: [
          {
            title: "nodes",
            type: "custom",
            description: "The types of nodes in your discourse graph",
            defaultValue: DEFAULT_NODE_VALUES,
            options: {
              component: NodeConfigPanel,
            },
          },
          {
            title: "relations",
            type: "custom",
            description: "The types of relations in your discourse graph",
            defaultValue: DEFAULT_RELATION_VALUES,
            options: {
              component: RelationConfigPanel,
            },
          },
        ],
      },
    ],
  },
});
refreshConfigTree();

document.addEventListener("keydown", (e) => {
  if (e.key === "\\") {
    const target = e.target as HTMLElement;
    if (
      target.tagName === "TEXTAREA" &&
      target.classList.contains("rm-block-input")
    ) {
      render({ textarea: target as HTMLTextAreaElement });
      e.preventDefault();
      e.stopPropagation();
    }
  }
});

window.roamAlphaAPI.ui.commandPalette.addCommand({
  label: "Export Discourse Graph",
  callback: () => exportRender({}),
});

const elToTitle = (e: Node): string => {
  if (e.nodeName === "#text") {
    return e.nodeValue;
  } else if (
    e.nodeName === "SPAN" &&
    (e as HTMLSpanElement).classList.contains("rm-page-ref__brackets")
  ) {
    return "";
  } else if (
    e.nodeName === "SPAN" &&
    (e as HTMLSpanElement).classList.contains("rm-page-ref")
  ) {
    return `[[${Array.from(e.childNodes).map(elToTitle).join("")}]]`;
  } else {
    return Array.from(e.childNodes).map(elToTitle).join("");
  }
};

createHTMLObserver({
  tag: "H1",
  className: "rm-title-display",
  callback: (h1: HTMLHeadingElement) => {
    const title = elToTitle(h1);
    const [createdTime, uid] = (window.roamAlphaAPI.q(
      `[:find ?ct ?uid :where [?cu :user/uid ?uid] [?p :create/user ?cu] [?p :create/time ?ct] [?p :node/title "${title}"]]`
    )[0] as [number, string]) || [0, ""];
    if (uid) {
      const displayName = getDisplayNameByUid(uid);
      const container = document.createElement("div");
      const oldMarginBottom = getComputedStyle(h1).marginBottom;
      container.style.marginTop = `${
        4 - Number(oldMarginBottom.replace("px", "")) / 2
      }px`;
      container.style.marginBottom = oldMarginBottom;
      const label = document.createElement("i");
      label.innerText = `Created by ${displayName || "Anonymous"} on ${new Date(
        createdTime
      ).toLocaleDateString()}`;
      container.appendChild(label);
      if (h1.parentElement.lastChild === h1) {
        h1.parentElement.appendChild(container);
      } else {
        h1.parentElement.insertBefore(container, h1.nextSibling);
      }
      if (title.startsWith("Playground")) {
        const children = document.querySelector<HTMLDivElement>(
          ".roam-article .rm-block-children"
        );
        if (!children.hasAttribute("data-roamjs-discourse-playground")) {
          children.setAttribute("data-roamjs-discourse-playground", "true");
          children.style.display = "none";
          const p = document.createElement("div");
          children.parentElement.appendChild(p);
          p.style.height = "500px";
          cyRender({ p, title });
        }
      }
    }
  },
});

createButtonObserver({
  shortcut: "synthesis",
  attribute: "synthesis",
  render: synthesisRender,
});

createHTMLObserver({
  tag: "DIV",
  className: "rm-reference-main",
  callback: (d: HTMLDivElement) => {
    const title = elToTitle(getPageTitleByHtmlElement(d));
    if (
      NODE_TITLE_REGEX.test(title) &&
      !d.getAttribute("data-roamjs-discourse-context")
    ) {
      d.setAttribute("data-roamjs-discourse-context", "true");
      const parent = d.querySelector("div.rm-reference-container");
      if (parent) {
        const p = document.createElement("div");
        parent.parentElement.insertBefore(p, parent);
        contextRender({ p, title: elToTitle(getPageTitleByHtmlElement(d)) });
      }
    }
  },
});

setTimeout(() => {
  if (isFlagEnabled("preview")) {
    createHTMLObserver({
      useBody: true,
      tag: "SPAN",
      className: "rm-page-ref",
      callback: (s: HTMLSpanElement) => {
        const tag =
          s.getAttribute("data-tag") ||
          s.parentElement.getAttribute("data-link-title");
        if (!s.getAttribute("data-roamjs-discourse-augment-tag")) {
          s.setAttribute("data-roamjs-discourse-augment-tag", "true");
          const parent = document.createElement("span");
          previewRender({ parent, tag });
          s.appendChild(parent);
        }
      },
    });
  }
}, 1);

window.addEventListener("hashchange", (e) => {
  if (e.oldURL.endsWith(pageUid)) {
    refreshConfigTree();
  }
});
