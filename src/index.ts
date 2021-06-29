import {
  createButtonObserver,
  createHTMLObserver,
  getDisplayNameByUid,
  toConfig,
} from "roam-client";
import { createConfigObserver } from "roamjs-components";
import { render } from "./NodeMenu";
import { render as exportRender } from "./ExportDialog";
import { render as synthesisRender } from "./SynthesisQuery";

const CONFIG = toConfig("discourse-graph");
createConfigObserver({ title: CONFIG, config: { tabs: [] } });

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
  label: "Export Property Graph CSV",
  callback: () => exportRender({}),
});

const elToTitle = (e: HTMLElement): string => {
  if (e.nodeName === "#text") {
    return e.nodeValue;
  } else if (e.classList.contains("rm-page-ref__brackets")) {
    return "";
  } else if (e.classList.contains("rm-page-ref")) {
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
    const [createdTime, uid] = window.roamAlphaAPI.q(
      `[:find ?ct ?uid :where [?cu :user/uid ?uid] [?p :create/user ?cu] [?p :create/time ?ct] [?p :node/title "${title}"]]`
    )[0] || [0, ""];
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
      if (title.startsWith("[[EVD]]")) {
        const earliestBlockRef = window.roamAlphaAPI
          .q(
            `[:find ?u ?t :where [?b :block/uid ?u] [?b :create/time ?t] [?b :block/refs ?p] [?p :node/title "${title}"]]`
          )
          .reduce(
            (prev, cur) => (prev[1] > cur[1] ? cur : prev),
            ["", Number.MAX_VALUE]
          )[0];
        if (earliestBlockRef) {
          const referencedPaper = window.roamAlphaAPI
            .q(
              `[:find ?t :where [?r :node/title ?t] [?p :block/refs ?r] [?b :block/parents ?p] [?b :block/uid "${earliestBlockRef}"]]`
            )
            .map((s) => s[0] as string)
            .find((s) => s.startsWith("@"));
          if (referencedPaper) {
            const citation = document.createElement("span");
            citation.innerText = ` - ${referencedPaper}`;
            h1.appendChild(citation);
            new MutationObserver(() => h1.appendChild(citation)).observe(h1, {
              attributeFilter: ["class"],
            });
          }
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
