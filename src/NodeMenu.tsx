import { Menu, MenuItem, Popover, Position } from "@blueprintjs/core";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import ReactDOM from "react-dom";
import {
  createBlock,
  createPage,
  getPageUidByPageTitle,
  getTextByBlockUid,
  getTreeByPageName,
  getUids,
  openBlockInSidebar,
  updateBlock,
} from "roam-client";
import { getCoordsFromTextarea } from "roamjs-components";
import { NODE_LABELS } from "./util";

type Props = {
  textarea: HTMLTextAreaElement;
};

const indexBySC = Object.fromEntries(
  NODE_LABELS.map((mi, i) => [mi.shortcut, i])
);

const shortcuts = new Set(Object.keys(indexBySC));

const NodeMenu = ({ onClose, textarea }: { onClose: () => void } & Props) => {
  const blockUid = useMemo(() => getUids(textarea).blockUid, [textarea]);
  const menuRef = useRef<HTMLUListElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const onSelect = useCallback(
    (index) => {
      const abbr = menuRef.current.children[index]
        .querySelector(".bp3-menu-item")
        .getAttribute("data-abbr");
      const text = getTextByBlockUid(blockUid);
      const highlighted = textarea.value.substring(
        textarea.selectionStart,
        textarea.selectionEnd
      );
      const pagename = `[[${abbr}]] - ${highlighted}`;
      const newText = `${text.substring(
        0,
        textarea.selectionStart
      )}[[${pagename}]]${text.substring(textarea.selectionEnd)}`;
      updateBlock({ text: newText, uid: blockUid });
      setTimeout(() => {
        if (highlighted) {
          const pageUid =
            getPageUidByPageTitle(pagename) || createPage({ title: pagename });
          if (pageUid) {
            setTimeout(() => {
              const nodes = getTreeByPageName(abbr);
              nodes.forEach((node, order) =>
                createBlock({ node, order, parentUid: pageUid })
              );
              openBlockInSidebar(pageUid);
              setTimeout(() => {
                const sidebarTitle = document.querySelector(
                  ".rm-sidebar-outline .rm-title-display"
                );
                sidebarTitle.dispatchEvent(
                  new MouseEvent("mousedown", { bubbles: true })
                );
                setTimeout(() => {
                  const ta = document.activeElement as HTMLTextAreaElement;
                  ta.selectionStart = ta.selectionEnd = ta.value.length;
                }, 1);
              }, 1);
            }, 1);
          }
        } else {
          setTimeout(() => {
            if (document.activeElement.tagName === "TEXTAREA") {
              (document.activeElement as HTMLTextAreaElement).setSelectionRange(
                textarea.selectionStart + 12,
                textarea.selectionStart + 12
              );
            }
          }, 1);
        }
      }, 1);
      onClose();
    },
    [menuRef, blockUid, onClose]
  );
  const keydownListener = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        const index = Number(menuRef.current.getAttribute("data-active-index"));
        const count = menuRef.current.childElementCount;
        setActiveIndex((index + 1) % count);
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        const index = Number(menuRef.current.getAttribute("data-active-index"));
        const count = menuRef.current.childElementCount;
        setActiveIndex((index - 1 + count) % count);
      } else if (e.key === "Enter") {
        const index = Number(menuRef.current.getAttribute("data-active-index"));
        onSelect(index);
      } else if (shortcuts.has(e.key.toUpperCase())) {
        onSelect(indexBySC[e.key.toUpperCase()]);
      } else {
        return;
      }
      e.stopPropagation();
      e.preventDefault();
    },
    [menuRef, setActiveIndex]
  );
  useEffect(() => {
    textarea.addEventListener("keydown", keydownListener);
    textarea.addEventListener("input", onClose);
    return () => {
      textarea.removeEventListener("keydown", keydownListener);
      textarea.removeEventListener("input", onClose);
    };
  }, [keydownListener, onClose]);
  return (
    <Popover
      onClose={onClose}
      isOpen={true}
      canEscapeKeyClose
      minimal
      target={<span />}
      position={Position.BOTTOM_RIGHT}
      content={
        <Menu ulRef={menuRef} data-active-index={activeIndex}>
          {NODE_LABELS.map((item, i) => {
            return (
              <MenuItem
                key={item.text}
                data-abbr={item.abbr}
                text={`${item.text} - (${item.shortcut})`}
                active={i === activeIndex}
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => onSelect(i)}
              />
            );
          })}
        </Menu>
      }
    />
  );
};

export const render = (props: Props) => {
  const parent = document.createElement("span");
  const coords = getCoordsFromTextarea(props.textarea);
  parent.style.position = "absolute";
  parent.style.left = `${coords.left}px`;
  parent.style.top = `${coords.top}px`;
  props.textarea.parentElement.insertBefore(parent, props.textarea);
  ReactDOM.render(
    <NodeMenu
      {...props}
      onClose={() => {
        ReactDOM.unmountComponentAtNode(parent);
        parent.remove();
      }}
    />,
    parent
  );
};

export default NodeMenu;
