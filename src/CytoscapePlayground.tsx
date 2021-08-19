import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import ReactDOM from "react-dom";
import cytoscape from "cytoscape";
import {
  Button,
  Classes,
  Drawer,
  Intent,
  Menu,
  MenuItem,
  Position,
  Tooltip,
} from "@blueprintjs/core";
import {
  createBlock,
  createPage,
  deleteBlock,
  getFirstChildTextByBlockUid,
  getPageUidByPageTitle,
  getShallowTreeByParentUid,
  getTreeByBlockUid,
  InputTextNode,
  openBlockInSidebar,
  updateBlock,
} from "roam-client";
import { renderToast, setInputSetting, toFlexRegex } from "roamjs-components";
import SynthesisQuery from "./SynthesisQuery";
import LivePreview, { Props as LivePreviewProps } from "./LivePreview";
import {
  getNodes,
  getPixelValue,
  getRelations,
  getRelationTriples,
} from "./util";
import editCursor from './cursors/edit.png';
import trashCursor from './cursors/trash.png';

const NodeIcon = ({
  shortcut,
  color,
  onClick,
}: {
  shortcut: string;
  color: string;
  onClick?: () => void;
}) => (
  <span
    style={{
      height: 16,
      width: 16,
      borderRadius: "50%",
      backgroundColor: `#${color}`,
      color: "#FFFFFF",
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      cursor: "pointer",
      margin: "0 2px",
    }}
    onClick={onClick}
  >
    {shortcut}
  </span>
);

const SynthesisQueryPane = ({
  blockUid,
  isOpen,
  close,
  clearOnClick,
}: {
  blockUid: string;
  isOpen: boolean;
  close: () => void;
  clearOnClick: (s: string, m: string) => void;
}) => {
  const [width, setWidth] = useState(0);
  const drawerRef = useRef<HTMLDivElement>(null);
  const calculateWidth = useCallback(() => {
    const width = getPixelValue(drawerRef.current, "width");
    const paddingLeft = getPixelValue(
      document.querySelector(".rm-article-wrapper"),
      "paddingLeft"
    );
    setWidth(width - paddingLeft);
  }, [setWidth, drawerRef]);
  useEffect(() => {
    if (isOpen) {
      setTimeout(calculateWidth, 1);
    } else {
      setWidth(0);
    }
  }, [setWidth, isOpen]);
  const onMouseMove = useCallback(
    (e: MouseEvent) => {
      drawerRef.current.parentElement.style.width = `${Math.max(
        e.clientX,
        100
      )}px`;
      calculateWidth();
    },
    [calculateWidth, drawerRef]
  );
  const onMouseUp = useCallback(() => {
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
  }, [onMouseMove]);
  const onMouseDown = useCallback(() => {
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, [onMouseMove, onMouseUp]);
  return (
    <Drawer
      isOpen={isOpen}
      isCloseButtonShown
      onClose={close}
      position={Position.LEFT}
      title={"Synthesis Query"}
      hasBackdrop={false}
      canOutsideClickClose={false}
      canEscapeKeyClose
      portalClassName={"roamjs-discourse-playground-drawer"}
    >
      <style>{`
.roam-article {
  margin-left: ${width}px;
}
`}</style>
      <div className={Classes.DRAWER_BODY} ref={drawerRef}>
        <SynthesisQuery
          blockUid={blockUid}
          clearResultIcon={{ name: "hand-right", onClick: clearOnClick }}
        />
      </div>
      <div
        style={{
          width: 4,
          cursor: "ew-resize",
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
        }}
        onMouseDown={onMouseDown}
      />
    </Drawer>
  );
};

type Props = {
  title: string;
  previewEnabled: boolean;
};

const useTreeFieldUid = ({
  tree,
  parentUid,
  field,
}: {
  parentUid: string;
  field: string;
  tree: { text: string; uid: string }[];
}) =>
  useMemo(
    () =>
      tree.find((t) => toFlexRegex(field).test(t.text))?.uid ||
      createBlock({ node: { text: field }, parentUid }),
    [tree, field, parentUid]
  );

const DEFAULT_SELECTED_RELATION = {
  display: "none",
  top: 0,
  left: 0,
  label: "",
  id: "",
};

const COLORS = [
  "8b0000",
  "9b870c",
  "008b8b",
  "00008b",
  "8b008b",
  "85200c",
  "ee7600",
  "008b00",
  "26428B",
  "2f062f",
];
const TEXT_COLOR = "888888";

const CytoscapePlayground = ({ title, previewEnabled }: Props) => {
  const pageUid = useMemo(() => getPageUidByPageTitle(title), [title]);
  const containerRef = useRef<HTMLDivElement>(null);
  const shadowInputRef = useRef<HTMLInputElement>(null);
  const cyRef = useRef<cytoscape.Core>(null);
  const sourceRef = useRef<cytoscape.NodeSingular>(null);
  const editingRef = useRef<cytoscape.SingularElementArgument>(null);
  const coloredNodes = useMemo(
    () =>
      getNodes()
        .slice(0, COLORS.length)
        .map((n, i) => ({
          color: COLORS[i],
          ...n,
        }))
        .concat({
          color: TEXT_COLOR,
          text: "Text",
          shortcut: "T",
          abbr: "TEX",
        }),
    []
  );
  const [selectedNode, setSelectedNode] = useState(
    coloredNodes[coloredNodes.length - 1]
  );
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const nodeColorRef = useRef(selectedNode.color);
  const clearEditingRef = useCallback(() => {
    if (editingRef.current) {
      editingRef.current.style("border-width", 0);
      if (editingRef.current.isNode()) {
        editingRef.current.unlock();
      }
      editingRef.current = null;
    }
  }, [editingRef]);
  const clearSourceRef = useCallback(() => {
    if (sourceRef.current) {
      sourceRef.current.style(
        "background-color",
        `#${sourceRef.current.data("color")}`
      );
      sourceRef.current.unlock();
      sourceRef.current = null;
    }
  }, [sourceRef]);
  const [selectedRelation, setSelectedRelation] = useState(
    DEFAULT_SELECTED_RELATION
  );
  const clearEditingRelation = useCallback(() => {
    setSelectedRelation(DEFAULT_SELECTED_RELATION);
    cyRef.current.zoomingEnabled(true);
    cyRef.current.panningEnabled(true);
  }, [setSelectedRelation, cyRef]);
  const allRelations = useMemo(getRelationTriples, []);
  const filteredRelations = useMemo(() => {
    if (selectedRelation.id) {
      const edge = cyRef.current.edges(
        `#${selectedRelation.id}`
      ) as cytoscape.EdgeSingular;
      const sourceColor = edge.source().data("color");
      const targetColor = edge.target().data("color");
      return allRelations
        .filter((k) => {
          if (sourceColor === TEXT_COLOR || targetColor === TEXT_COLOR) {
            return true;
          }
          return (
            k.source ===
              coloredNodes.find((n) => n.color === sourceColor).abbr &&
            k.target === coloredNodes.find((n) => n.color === targetColor).abbr
          );
        })
        .filter((k) => k.relation !== selectedRelation.label);
    }
    return allRelations;
  }, [allRelations, selectedRelation, cyRef, coloredNodes]);
  const tree = useMemo(() => getShallowTreeByParentUid(pageUid), [pageUid]);
  const elementsUid = useTreeFieldUid({
    tree,
    parentUid: pageUid,
    field: "elements",
  });
  const queryUid = useTreeFieldUid({
    tree,
    parentUid: pageUid,
    field: "query",
  });
  const edgeCallback = useCallback(
    (edge: cytoscape.EdgeSingular) => {
      edge.on("click", (e) => {
        if ((e.originalEvent.target as HTMLElement).tagName !== "CANVAS") {
          return;
        }
        clearSourceRef();
        if (e.originalEvent.ctrlKey) {
          clearEditingRef();
          deleteBlock(edge.id());
          cyRef.current.remove(edge);
        } else if (editingRef.current === edge) {
          clearEditingRef();
          clearEditingRelation();
        } else {
          clearEditingRef();
          const { x1, y1 } = cyRef.current.extent();
          const zoom = cyRef.current.zoom();
          editingRef.current = edge;
          setSelectedRelation({
            display: "block",
            top: (e.position.y - y1) * zoom,
            left: (e.position.x - x1) * zoom,
            label: edge.data("label"),
            id: edge.id(),
          });
          cyRef.current.zoomingEnabled(false);
          cyRef.current.panningEnabled(false);
        }
      });
    },
    [clearSourceRef, clearEditingRef, setSelectedRelation, cyRef]
  );
  const [livePreviewTag, setLivePreviewTag] = useState("");
  const registerMouseEvents = useCallback<
    LivePreviewProps["registerMouseEvents"]
  >(
    ({ open, close, span }) => {
      const root = span.closest<HTMLSpanElement>(".bp3-popover-wrapper");
      root.style.position = "absolute";
      cyRef.current.on("mousemove", (e) => {
        if (
          e.target === cyRef.current &&
          cyRef.current.scratch("roamjs_preview_tag")
        ) {
          cyRef.current.scratch("roamjs_preview_tag", "");
        }
        const tag = cyRef.current.scratch("roamjs_preview_tag");
        const isOpen = cyRef.current.scratch("roamjs_preview");

        if (isOpen && !tag) {
          cyRef.current.scratch("roamjs_preview", false);
          close();
        } else if (tag) {
          const { x1, y1 } = cyRef.current.extent();
          const zoom = cyRef.current.zoom();
          root.style.top = `${(e.position.y - y1) * zoom}px`;
          root.style.left = `${(e.position.x - x1) * zoom}px`;
          setLivePreviewTag(tag);
          if (!isOpen) {
            cyRef.current.scratch("roamjs_preview", true);
            open(e.originalEvent.ctrlKey);
          }
        }
      });
    },
    [cyRef]
  );
  const nodeTapCallback = useCallback(
    (n: cytoscape.NodeSingular) => {
      n.style("background-color", `#${n.data("color")}`);
      n.on("click", (e) => {
        if ((e.originalEvent.target as HTMLElement).tagName !== "CANVAS") {
          return;
        }
        clearEditingRelation();
        if (e.originalEvent.ctrlKey) {
          clearSourceRef();
          clearEditingRef();
          deleteBlock(n.id());
          n.connectedEdges().forEach((edge) => {
            deleteBlock(edge.id());
          });
          cyRef.current.remove(n);
        } else if (e.originalEvent.shiftKey) {
          clearEditingRef();
          if (n.style("color") === "#FFFFFF") {
            if (sourceRef.current) {
              const source = sourceRef.current.id();
              const target = n.id();
              if (source !== target) {
                const sourceType = coloredNodes.find(
                  (c) => c.color === sourceRef.current.data("color")
                ).abbr;
                const targetType = coloredNodes.find(
                  (c) => c.color === n.data("color")
                ).abbr;
                const text =
                  allRelations.find(
                    (r) => r.source === sourceType && r.target === targetType
                  )?.relation ||
                  (sourceType === "TEX" || targetType === "TEX"
                    ? allRelations[0].relation
                    : "");
                if (text) {
                  const rest = {
                    source,
                    target,
                  };
                  const id = createBlock({
                    node: {
                      text,
                      children: Object.entries(rest).map(([k, v]) => ({
                        text: k,
                        children: [{ text: v }],
                      })),
                    },
                    parentUid: elementsUid,
                  });
                  const edge = cyRef.current.add({
                    data: { id, label: text, ...rest },
                  });
                  edgeCallback(edge);
                } else {
                  renderToast({
                    id: "roamjs-discourse-relation-error",
                    intent: Intent.DANGER,
                    content:
                      "There are no relations defined between these two node types",
                  });
                }
              }
              clearSourceRef();
            } else {
              n.style("background-color", "#000000");
              n.lock();
              sourceRef.current = n;
            }
          } else {
            const title = n.data("label");
            const uid = getPageUidByPageTitle(title) || createPage({ title });
            setTimeout(() => openBlockInSidebar(uid), 1);
          }
        } else {
          clearSourceRef();
          if (editingRef.current) {
            clearEditingRef();
          } else if (!["source", "destination"].includes(n.id())) {
            editingRef.current = n;
            editingRef.current.lock();
            shadowInputRef.current.value = n.data("label");
            shadowInputRef.current.focus({ preventScroll: true });
            const { x1, y1 } = cyRef.current.extent();
            const zoom = cyRef.current.zoom();
            shadowInputRef.current.style.top = `${
              (e.position.y - y1) * zoom
            }px`;
            shadowInputRef.current.style.left = `${
              (e.position.x - x1) * zoom
            }px`;
            n.style("border-width", 4);
          }
        }
      });
      n.on("dragfree", () => {
        const uid = n.data("id");
        const { x, y } = n.position();
        setInputSetting({ blockUid: uid, value: `${x}`, key: "x" });
        setInputSetting({ blockUid: uid, value: `${y}`, key: "y" });
      });
      n.on("mousemove", (e) => {
        const inLabel =
          Math.abs(e.position.y - n.position().y) < n.height() / 4;
        if (e.originalEvent.shiftKey && inLabel) {
          n.style("color", "#106ba3");
        } else {
          n.style("color", "#FFFFFF");
        }
        if (e.originalEvent.shiftKey) {
          containerRef.current.style.cursor = inLabel ? "alias" : "pointer";
        } else if (e.originalEvent.ctrlKey) {
          containerRef.current.style.cursor = `url(${trashCursor}), auto`;
        } else {
          containerRef.current.style.cursor = `url(${editCursor}), auto`;
        }
      });
      n.on("mouseover", () => {
        const tag = n.data("label");
        cyRef.current.scratch("roamjs_preview_tag", tag);
      });
      n.on("mouseout", () => {
        cyRef.current.scratch("roamjs_preview_tag", "");
        n.style("color", "#FFFFFF");
        containerRef.current.style.cursor = "unset";
      });
    },
    [
      elementsUid,
      sourceRef,
      cyRef,
      editingRef,
      allRelations,
      shadowInputRef,
      containerRef,
      clearEditingRef,
      clearSourceRef,
      clearEditingRelation,
      edgeCallback,
    ]
  );
  const createNode = useCallback(
    (text: string, position: { x: number; y: number }, color: string) => {
      const uid = createBlock({
        node: {
          text,
          children: [
            { text: "x", children: [{ text: position.x.toString() }] },
            { text: "y", children: [{ text: position.y.toString() }] },
            { text: "color", children: [{ text: color }] },
          ],
        },
        parentUid: elementsUid,
      });
      const node = cyRef.current.add({
        data: { id: uid, label: text, color },
        position,
      })[0];
      nodeTapCallback(node);
    },
    [nodeTapCallback, cyRef, elementsUid, nodeColorRef]
  );
  useEffect(() => {
    cyRef.current = cytoscape({
      container: containerRef.current,
      elements: [
        ...getShallowTreeByParentUid(elementsUid).map(({ text, uid }) => {
          const {
            x = "0",
            y = "0",
            color = TEXT_COLOR,
            ...data
          } = Object.fromEntries(
            getShallowTreeByParentUid(uid).map(({ text, uid }) => [
              text,
              getFirstChildTextByBlockUid(uid),
            ])
          );
          return {
            data: {
              label: text,
              color,
              id: uid,
              ...data,
            },
            position: { x: Number(x), y: Number(y) },
          };
        }),
      ],

      style: [
        {
          selector: "node",
          style: {
            "background-color": `#${TEXT_COLOR}`,
            label: "data(label)",
            shape: "round-rectangle",
            color: "#FFFFFF",
            "text-wrap": "wrap",
            "text-halign": "center",
            "text-valign": "center",
            "text-max-width": "160",
            width: 160,
            height: 160,
          },
        },
        {
          selector: "edge",
          style: {
            width: 10,
            "line-color": "#ccc",
            "target-arrow-color": "#ccc",
            "target-arrow-shape": "triangle",
            "curve-style": "bezier",
            label: "data(label)",
          },
        },
      ],

      layout: {
        name: "preset",
      },
      maxZoom: 5,
      minZoom: 0.25,
    });
    cyRef.current.on("click", (e) => {
      if (
        e.target !== cyRef.current ||
        (e.originalEvent.target as HTMLElement).tagName !== "CANVAS"
      ) {
        return;
      }
      if (!editingRef.current && !sourceRef.current) {
        const nodeType = coloredNodes.find(
          (c) => c.color === nodeColorRef.current
        ).abbr;
        createNode(
          `${
            nodeType === "TEX" ? "" : `[[${nodeType}]] - `
          }Click to edit block`,
          e.position,
          nodeColorRef.current
        );
      } else {
        clearEditingRef();
        clearSourceRef();
        clearEditingRelation();
      }
    });
    cyRef.current.nodes().forEach(nodeTapCallback);
    cyRef.current.edges().forEach(edgeCallback);
  }, [
    elementsUid,
    cyRef,
    containerRef,
    clearSourceRef,
    clearEditingRelation,
    clearEditingRef,
    edgeCallback,
    nodeTapCallback,
    createNode,
    coloredNodes,
    nodeColorRef,
  ]);
  const [maximized, setMaximized] = useState(false);
  const maximize = useCallback(() => setMaximized(true), [setMaximized]);
  const minimize = useCallback(() => setMaximized(false), [setMaximized]);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const onDrawerOpen = useCallback(() => {
    setIsDrawerOpen(true);
  }, [setIsDrawerOpen]);
  const onDrawerClose = useCallback(
    () => setIsDrawerOpen(false),
    [setIsDrawerOpen]
  );
  return (
    <>
      <div
        style={{
          width: "100%",
          height: "100%",
          border: "1px solid gray",
          background: "white",
          zIndex: 1,
          ...(maximized ? { inset: 0, position: "absolute" } : {}),
        }}
        ref={containerRef}
      >
        <div style={{ position: "absolute", top: 8, right: 8, zIndex: 10 }}>
          <span
            style={{
              transform: `scale(${colorPickerOpen ? 1 : 0}, 1)`,
              transition: "transform 0.25s linear, left 0.25s linear",
              display: "inline-flex",
              position: "relative",
              left: colorPickerOpen ? 0 : 60,
              height: "100%",
              verticalAlign: "middle",
            }}
          >
            {coloredNodes
              .filter((f) => f !== selectedNode)
              .map((n) => (
                <Tooltip
                  content={n.text}
                  key={n.text}
                  position={Position.BOTTOM}
                >
                  <NodeIcon
                    {...n}
                    onClick={() => {
                      nodeColorRef.current = n.color;
                      setSelectedNode(n);
                      setColorPickerOpen(false);
                    }}
                    key={n.text}
                  />
                </Tooltip>
              ))}
          </span>
          <Tooltip content={"Node Picker"} position={Position.BOTTOM}>
            <Button
              icon={<NodeIcon {...selectedNode} />}
              onClick={() => setColorPickerOpen(!colorPickerOpen)}
              style={{ marginRight: 8, padding: "7px 5px" }}
            />
          </Tooltip>
          <Tooltip
            content={"Open Synthesis Query Pane"}
            position={Position.BOTTOM}
          >
            <Button
              icon={"drawer-left"}
              onClick={onDrawerOpen}
              style={{ marginRight: 8 }}
            />
          </Tooltip>
          {maximized ? (
            <>
              <style>{`div.roam-body div.roam-app div.roam-main div.roam-article {\n  position: static;\n}`}</style>
              <Tooltip content={"Minimize"} position={Position.BOTTOM}>
                <Button icon={"minimize"} onClick={minimize} />
              </Tooltip>
            </>
          ) : (
            <Tooltip content={"Maximize"} position={Position.BOTTOM}>
              <Button icon={"maximize"} onClick={maximize} />
            </Tooltip>
          )}
          <Tooltip content={"Generate Roam Blocks"} position={Position.BOTTOM}>
            <Button
              style={{ marginLeft: 8 }}
              icon={"export"}
              onClick={() => {
                const elementsTree = getTreeByBlockUid(elementsUid).children;
                const relationData = getRelations();
                const recentPageRef: Record<string, string> = {};
                const recentlyOpened = new Set<string>();
                elementsTree
                  .map((n) => {
                    const sourceUid = n.children.find((c) =>
                      toFlexRegex("source").test(c.text)
                    )?.children?.[0]?.text;
                    const targetUid = n.children.find((c) =>
                      toFlexRegex("target").test(c.text)
                    )?.children?.[0]?.text;
                    if (sourceUid && targetUid) {
                      const sourceNode = elementsTree.find(
                        (b) => b.uid === sourceUid
                      );
                      const targetNode = elementsTree.find(
                        (b) => b.uid === targetUid
                      );
                      return {
                        source: sourceNode?.text || "",
                        target: targetNode?.text || "",
                        relation: n.text,
                      };
                    }
                    return false;
                  })
                  .map((e) => {
                    if (!e) return [];
                    const { triples, source, destination, label } =
                      relationData.find(
                        (r) =>
                          r.label === e.relation || r.complement === e.relation
                      );
                    const isOriginal = label === e.relation;
                    const newTriples = triples.map((t) => {
                      if (/is a/i.test(t[1])) {
                        return [
                          t[0],
                          "has title",
                          (t[2] === source && isOriginal) ||
                          (t[2] === destination && !isOriginal)
                            ? e.source
                            : e.target,
                        ];
                      }
                      return t.slice(0);
                    });
                    return newTriples.map(([source, relation, target]) => ({
                      source,
                      relation,
                      target,
                    }));
                  })
                  .forEach((triples) => {
                    const relationToTitle = (source: string) =>
                      triples.find(
                        (h) =>
                          h.source === source && /has title/i.test(h.relation)
                      )?.target || source;
                    const toBlock = (source: string): InputTextNode => ({
                      text: `Some block text ${triples
                        .filter(
                          (e) =>
                            /references/i.test(e.relation) &&
                            e.source === source
                        )
                        .map((e) => ` [[${relationToTitle(e.target)}]]`)}`,
                      children: [
                        ...triples
                          .filter(
                            (c) =>
                              /has child/i.test(c.relation) &&
                              c.source === source
                          )
                          .map((c) => toBlock(c.target)),
                        ...triples
                          .filter(
                            (c) =>
                              /has parent/i.test(c.relation) &&
                              c.target === source
                          )
                          .map((c) => toBlock(c.source)),
                      ],
                    });
                    const toPage = (title: string, blocks: string[]) => {
                      const parentUid =
                        getPageUidByPageTitle(title) ||
                        recentPageRef[title] ||
                        (recentPageRef[title] = createPage({
                          title: title,
                        }));
                      blocks
                        .map(toBlock)
                        .map((node, order) =>
                          createBlock({ node, order, parentUid })
                        );
                      if (!recentlyOpened.has(parentUid)) {
                        recentlyOpened.add(parentUid);
                        setTimeout(() => openBlockInSidebar(parentUid), 1000);
                      }
                    };
                    const pageTriples = triples.filter((e) =>
                      /is in page/i.test(e.relation)
                    );
                    if (pageTriples.length) {
                      const pages = pageTriples.reduce(
                        (prev, cur) => ({
                          ...prev,
                          [cur.target]: [
                            ...(prev[cur.target] || []),
                            cur.source,
                          ],
                        }),
                        {} as Record<string, string[]>
                      );
                      Object.entries(pages).forEach((p) =>
                        toPage(relationToTitle(p[0]), p[1])
                      );
                    } else {
                      toPage(
                        `Auto generated from ${title}`,
                        Array.from(
                          triples.reduce(
                            (prev, cur) => {
                              if (
                                [/has child/i, /references/i].some((r) =>
                                  r.test(cur.relation)
                                )
                              ) {
                                if (!prev.leaves.has(cur.source)) {
                                  prev.roots.add(cur.source);
                                }
                                prev.leaves.add(cur.target);
                                prev.roots.delete(cur.target);
                              } else if (/has parent/i.test(cur.relation)) {
                                if (!prev.leaves.has(cur.target)) {
                                  prev.roots.add(cur.target);
                                }
                                prev.leaves.add(cur.source);
                                prev.roots.delete(cur.source);
                              }
                              return prev;
                            },
                            {
                              roots: new Set<string>(),
                              leaves: new Set<string>(),
                            }
                          ).roots
                        )
                      );
                    }
                  });
              }}
            />
          </Tooltip>
        </div>
        <SynthesisQueryPane
          isOpen={isDrawerOpen}
          close={onDrawerClose}
          blockUid={queryUid}
          clearOnClick={(s: string, m: string) => {
            const { x1, x2, y1, y2 } = cyRef.current.extent();
            createNode(
              s,
              { x: (x2 + x1) / 2, y: (y2 + y1) / 2 },
              coloredNodes.find((c) => c.text === m)?.color
            );
          }}
        />
        <Menu
          style={{
            position: "absolute",
            ...selectedRelation,
            zIndex: 1,
            background: "#eeeeee",
          }}
        >
          {filteredRelations.length ? (
            filteredRelations.map((k) => (
              <MenuItem
                key={k.relation}
                text={k.relation}
                onClick={() => {
                  const edge = cyRef.current.edges(
                    `#${selectedRelation.id}`
                  ) as cytoscape.EdgeSingular;
                  updateBlock({ uid: edge.id(), text: k.relation });
                  edge.data("label", k.relation);
                  clearEditingRelation();
                  clearEditingRef();
                }}
              />
            ))
          ) : (
            <MenuItem
              text={"No other relation could connect these nodes"}
              disabled
            />
          )}
        </Menu>
        <div style={{ width: 0, overflow: "hidden" }}>
          <input
            ref={shadowInputRef}
            style={{ opacity: 0, position: "absolute" }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                clearEditingRef();
                shadowInputRef.current.blur();
              } else if (e.key === "ArrowUp") {
                const val = Number(
                  editingRef.current.style("text-max-width").replace(/px$/, "")
                );
                editingRef.current.style("height", val * 1.1);
                editingRef.current.style("width", val * 1.1);
                editingRef.current.style(
                  "text-max-width",
                  (val * 1.1).toString()
                );
              } else if (e.key === "ArrowDown") {
                const val = Number(
                  editingRef.current.style("text-max-width").replace(/px$/, "")
                );
                editingRef.current.style("height", val / 1.1);
                editingRef.current.style("width", val / 1.1);
                editingRef.current.style(
                  "text-max-width",
                  (val / 1.1).toString()
                );
              }
            }}
            onChange={(e) => {
              const newValue = e.target.value;
              editingRef.current.data("label", newValue);
              updateBlock({ uid: editingRef.current.id(), text: newValue });
            }}
          />
        </div>
        {previewEnabled && (
          <LivePreview
            tag={livePreviewTag}
            registerMouseEvents={registerMouseEvents}
          />
        )}
      </div>
    </>
  );
};

export const render = ({ p, ...props }: { p: HTMLElement } & Props) =>
  ReactDOM.render(<CytoscapePlayground {...props} />, p);

export default CytoscapePlayground;
