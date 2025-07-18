import { importObject, setWasiInstance } from "./wasi_env.js";
import {
  domNodeRegistry,
  moduleCache,
  moduleRoutes,
  hooksHandlers,
} from "./maps.js";
import {
  applyHoverClass,
  updateComponentStyle,
  addKeyframesToStylesheet,
  checkMarkStyling,
} from "./wasi_styling.js";
import { traverse, traverseRemove } from "./traversal.js";
import { state } from "./state.js";

export let wasmInstance;
export let activeNodeIds = new Set();
export let rootNodeId = "root";
export let layoutInfo;

let tree_node;

let isDragging = false;
let offsetX, offsetY;
let draggableElement;

function startDrag(e) {
  isDragging = true;

  // Calculate the offset from the mouse position to the element's top-left corner
  const rect = draggableElement.getBoundingClientRect();
  offsetX = e.clientX - rect.left;
  offsetY = e.clientY - rect.top;
}

function drag(e) {
  if (!isDragging) return;

  // Prevent any default behavior
  e.preventDefault();

  // Calculate new position
  let left = e.clientX - offsetX;
  let top = e.clientY - offsetY;

  // Apply new position
  draggableElement.style.left = left + "px";
  draggableElement.style.top = top + "px";
}

function startDragTouch(e) {
  const touch = e.touches[0];
  const mouseEvent = new MouseEvent("mousedown", {
    clientX: touch.clientX,
    clientY: touch.clientY,
  });
  startDrag(mouseEvent);
}

function dragTouch(e) {
  if (!isDragging) return;

  const touch = e.touches[0];
  const mouseEvent = new MouseEvent("mousemove", {
    clientX: touch.clientX,
    clientY: touch.clientY,
  });
  drag(mouseEvent);
}

function endDrag() {
  isDragging = false;
}
// const socket = new WebSocket("ws://localhost:3003");
//
// // This fires when the connection is successfully established
// socket.onopen = function (event) {
//   console.log("WebSocket connection established!");
//   // Maybe update UI to show connected status
// };
//
// // Handle incoming messages
// socket.onmessage = async function (event) {
//   if (event.data === "refresh") {
//     // window.location.reload();
//     // updatePageContent();
//     if (state.initial_render === true) {
//       const rootElement = document.getElementById("contents");
//       rootElement.innerHTML = "";
//       initWasi();
//       // state.initial_render = true;
//       // state.initial_render = false;
//     } else {
//       const currentPath = window.location.pathname;
//       clearIntervalsForRoute(currentPath);
//
//       // Update the browser URL without reloading the page
//       // window.history.pushState({}, "", currentPath);
//
//       if (currentPath === "/") {
//         encodeString("/root");
//       } else {
//         encodeString(currentPath);
//       }
//       console.log(rootNodeId);
//       const rootElement = document.getElementById(rootNodeId);
//       rootElement.innerHTML = "";
//       tree_node = wasmInstance.getRenderTreePtr();
//       state.initial_render = true;
//       traverse(rootElement, tree_node, layoutInfo);
//       state.initial_render = false;
//       return;
//     }
//   }
// };
//
// // Handle errors
// socket.onerror = function (error) {
//   console.error("WebSocket error:", error);
// };
//
// // Handle disconnection
// socket.onclose = function (event) {
//   console.log("WebSocket connection closed:", event.code, event.reason);
// };

let layoutInfoPtr;

window.addEventListener("popstate", async function(event) {
  event.preventDefault();
  const path = window.location.pathname;
  // We first mark all non layout nodes as dirty this way we can traverse and remove
  // we use the dirty flag to indicate for removal
  wasmInstance.markAllNonLayoutNodesDirty();

  // we get the current tree pointer and traverse it to remove all the nodes that are not part of the layout
  const current_tree = wasmInstance.getRenderTreePtr();
  traverseRemove(root, current_tree, layoutInfo);

  // we push the state and renderCycle the new path
  // window.history.pushState({}, "", path);
  rerenderRoute(path === "/" ? "/root" : path);
  requestAnimationFrame(wasmInstance.setRerenderTrue);
});

window.addEventListener("load", async () => {
  const url = new URL(window.location.href);
  for (const [key, handler] of hooksHandlers.entries()) {
  }
});

async function loadWasiModule() {
  let pathname = window.location.pathname;
  pathname = "fabric";
  WebAssembly.instantiateStreaming(
    fetch(`zig-out/bin/${pathname}.wasm`),
    importObject,
  )
    .then((result) => {
      const exports = result.instance.exports;

      // Initialize WASI (calls Zig's main)
      if (exports._start) {
        try {
          exports._start(); // Triggers Zig's `main()`
        } catch (e) {
          // console.log("WASI exited:", e);
        }
      }

      moduleCache.set(pathname, exports);
      moduleRoutes.add(pathname);
      wasmInstance = exports;
      setWasiInstance(wasmInstance);
    })
    .then(() => {
      init(); // Your app initialization
    })
    .catch("Error", console.error);
}

async function initWasi() {
  wasmInstance = await loadWasiModule();
}

export const encodeString = (string) => {
  const buffer = new TextEncoder().encode(string);
  const pointer = wasmInstance.allocUint8(buffer.length + 1); // ask Zig to allocate memory
  const slice = new Uint8Array(
    wasmInstance.memory.buffer, // memory exported from Zig
    pointer,
    buffer.length + 1,
  );
  slice.set(buffer);
  slice[buffer.length] = 0; // null byte to null-terminate the string
  wasmInstance.setRouteRenderTree(pointer);
};

export const rerenderRoute = (route) => {
  const buffer = new TextEncoder().encode(route);
  const pointer = wasmInstance.allocUint8(buffer.length + 1); // ask Zig to allocate memory
  const slice = new Uint8Array(
    wasmInstance.memory.buffer, // memory exported from Zig
    pointer,
    buffer.length + 1,
  );
  slice.set(buffer);
  slice[buffer.length] = 0; // null byte to null-terminate the string
  wasmInstance.callRouteRenderCycle(pointer);
};

export const navToRoute = (string) => {
  const buffer = new TextEncoder().encode(string);
  const pointer = wasmInstance.allocUint8(buffer.length + 1); // ask Zig to allocate memory
  const slice = new Uint8Array(
    wasmInstance.memory.buffer, // memory exported from Zig
    pointer,
    buffer.length + 1,
  );
  slice.set(buffer);
  slice[buffer.length] = 0; // null byte to null-terminate the string
  wasmInstance.setRouteRenderTree(pointer);
};

export const allocString = (string) => {
  const buffer = new TextEncoder().encode(string);
  const pointer = wasmInstance.allocUint8(buffer.length + 1); // ask Zig to allocate memory
  const slice = new Uint8Array(
    wasmInstance.memory.buffer, // memory exported from Zig
    pointer,
    buffer.length + 1,
  );
  slice.set(buffer);
  slice[buffer.length] = 0; // null byte to null-terminate the string
  return pointer;
};

export let root;
async function init() {
  root = document.getElementById("contents");

  // Set up listener for back/forward buttons
  // Get the memory layout information
  // So we grab the memory layout of each render command
  layoutInfoPtr = wasmInstance.allocateLayoutInfo();
  layoutInfo = {
    renderCommandSize: new DataView(
      wasmInstance.memory.buffer,
      layoutInfoPtr,
      4,
    ).getUint32(0, true),
    boundingBoxOffset: new DataView(
      wasmInstance.memory.buffer,
      layoutInfoPtr + 4,
      4,
    ).getUint32(0, true),
    elemTypeOffset: new DataView(
      wasmInstance.memory.buffer,
      layoutInfoPtr + 8,
      4,
    ).getUint32(0, true),
    textPtrOffset: new DataView(
      wasmInstance.memory.buffer,
      layoutInfoPtr + 12,
      4,
    ).getUint32(0, true),
    textLenOffset: new DataView(
      wasmInstance.memory.buffer,
      layoutInfoPtr + 16,
      4,
    ).getUint32(0, true),
    hrefPtrOffset: new DataView(
      wasmInstance.memory.buffer,
      layoutInfoPtr + 20,
      4,
    ).getUint32(0, true),
    hrefLenOffset: new DataView(
      wasmInstance.memory.buffer,
      layoutInfoPtr + 24,
      4,
    ).getUint32(0, true),
    propsOffset: new DataView(
      wasmInstance.memory.buffer,
      layoutInfoPtr + 28,
      4,
    ).getUint32(0, true),
    propsSize: new DataView(
      wasmInstance.memory.buffer,
      layoutInfoPtr + 32,
      4,
    ).getUint32(0, true),
    propsBtnIdOffset: new DataView(
      wasmInstance.memory.buffer,
      layoutInfoPtr + 36,
      4,
    ).getUint32(0, true),
    dialogIdPtrOffset: new DataView(
      wasmInstance.memory.buffer,
      layoutInfoPtr + 40,
      4,
    ).getUint32(0, true),
    dialogIdLenOffset: new DataView(
      wasmInstance.memory.buffer,
      layoutInfoPtr + 44,
      4,
    ).getUint32(0, true),
    idPtrOffset: new DataView(
      wasmInstance.memory.buffer,
      layoutInfoPtr + 48,
      4,
    ).getUint32(0, true),
    idLenOffset: new DataView(
      wasmInstance.memory.buffer,
      layoutInfoPtr + 52,
      4,
    ).getUint32(0, true),
    showOffset: new DataView(
      wasmInstance.memory.buffer,
      layoutInfoPtr + 56,
      4,
    ).getUint32(0, true),
    hooksOffset: new DataView(
      wasmInstance.memory.buffer,
      layoutInfoPtr + 60,
      4,
    ).getUint32(0, true),
    nodePtrOffset: new DataView(
      wasmInstance.memory.buffer,
      layoutInfoPtr + 64,
      4,
    ).getUint32(0, true),
    propsHoverOffset: new DataView(
      wasmInstance.memory.buffer,
      layoutInfoPtr + 68,
      4,
    ).getUint32(0, true),
    propsHoverSize: new DataView(
      wasmInstance.memory.buffer,
      layoutInfoPtr + 72,
      4,
    ).getUint32(0, true),
    propsExitAnimation: new DataView(
      wasmInstance.memory.buffer,
      layoutInfoPtr + 76,
      4,
    ).getUint32(0, true),
    propsExitAnimationLength: new DataView(
      wasmInstance.memory.buffer,
      layoutInfoPtr + 80,
      4,
    ).getUint32(0, true),
    propsStyleId: new DataView(
      wasmInstance.memory.buffer,
      layoutInfoPtr + 84,
      4,
    ).getUint32(0, true),
    propsStyleIdLength: new DataView(
      wasmInstance.memory.buffer,
      layoutInfoPtr + 88,
      4,
    ).getUint32(0, true),
  };

  wasmInstance.instantiate(window.innerWidth, window.innerHeight); // Example UI function

  blk: while (true) {
    const motion = wasmInstance.nextMotion();
    if (motion > 0) {
      const motion_ptr = wasmInstance.getKeyFrames(motion);
      const motion_len = wasmInstance.getKeyFramesLen();
      const keyFrames = readWasmString(motion_ptr, motion_len);
      addKeyframesToStylesheet(keyFrames);
    } else {
      break blk;
    }
  }

  root.style.width = "100%";
  root.style.height = "100vh";
  const currentPath = window.location.pathname;
  if (currentPath === "/") {
    route_ptr = allocString("/root");
  } else {
    route_ptr = allocString(currentPath);
  }
  wasmInstance.renderUI(route_ptr);
  wasmInstance.markCurrentTreeDirty();
  tree_node = wasmInstance.getRenderTreePtr();

  activeNodeIds = new Set();
  traverse(root, tree_node, layoutInfo);
  state.initial_render = false;
  wasmInstance.pendingClassesToAdd();
  wasmInstance.pendingClassesToRemove();
  document.body.appendChild(root);
  wasmInstance.markCurrentTreeNotDirty();
  wasmInstance.resetRerender();
  const hash = window.location.hash;
  if (hash) {
    const id = window.location.hash.substring(1, hash.length);
    const element = document.getElementById(id);
    element.scrollIntoView();
  }

  // Super simple lazy loading
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        // entry.target.classList.add("loaded");
        observer.unobserve(entry.target);
      }
    });
  });

  // Find all elements with id="lazy" and observe them
  document.querySelectorAll('[id*="Inte"]').forEach((element) => {
    observer.observe(element);
  });
}

let route_ptr = null;

export function requestRerender() {
  if (!state.isRenderScheduled) {
    state.isRenderScheduled = true;
    requestAnimationFrame(render);
  }
}

export function render() {
  // Reset the flag since the scheduled render is now running.
  state.isRenderScheduled = false;

  const globalRerender = wasmInstance.shouldRerender();
  const grainRerender = wasmInstance.grainRerender();

  // Exit if no re-render is needed.
  if (!globalRerender && !grainRerender) {
    return;
  }

  try {
    if (globalRerender) {
      const currentPath = window.location.pathname;
      const route_ptr = allocString(
        currentPath === "/" ? "/root" : currentPath,
      );

      wasmInstance.renderUI(route_ptr);
      tree_node = wasmInstance.getRenderTreePtr();
      activeNodeIds = new Set();
      traverse(root, tree_node, layoutInfo);
      state.initial_render = false;
      wasmInstance.pendingClassesToAdd();
      wasmInstance.pendingClassesToRemove();
      callDestroyFncs();
      removeInactiveNodes();
      wasmInstance.markCurrentTreeNotDirty();
      wasmInstance.resetRerender();
      requestAnimationFrame(wasmInstance.cleanUp);
    } else {
      // This implies grainRerender is true
      console.log("Grain Rerender");
    }
  } catch (error) {
    console.error("An error occurred during the render cycle:", error);
  }
}
export function callDestroyFncs() {
  // Remove any nodes that aren't active in this render
  domNodeRegistry.forEach((node, nodeId) => {
    if (!activeNodeIds.has(nodeId)) {
      const destroyId = node.destroyId;
      if (destroyId !== null) {
        wasmInstance.hooksDestroyCallback(destroyId);
      }
    }
  });
}

function removeNodeWithExitAnimation(domNode, nodeId, animationName) {
  // Wait for animation to complete before removing from DOM
  domNode.addEventListener("animationend", function handler(e) {
    if (e.animationName === animationName) {
      // Only remove if it was the fadeOut animation that ended
      domNode.removeEventListener("animationend", handler);
      // domNode.classList.remove("fade-out");
      domNode.parentNode.removeChild(domNode);
      domNodeRegistry.delete(nodeId);
    }
  });
  return;
}

function getDepth(el) {
  let d = 0;
  while (el.parentElement) {
    d++;
    el = el.parentElement;
  }
  return d;
}

function removeAnimatedNodeTree(el) {
  for (const child of el.children) {
    toRemove = removeByIdSwap(toRemove, child.id);
    removeAnimatedNodeTree(child);
  }
}

const removeByIdSwap = (arr, idToRemove) => {
  const idx = arr.findIndex((item) => item.nodeId === idToRemove);
  if (idx !== -1) {
    // Move the last element into the “hole” and pop
    arr[idx] = arr[arr.length - 1];
    arr.pop();
  }
  return arr;
};

let toRemove = [];
export function removeInactiveNodes() {
  // Remove any nodes that aren't active in this render
  toRemove = [];
  domNodeRegistry.forEach((node, nodeId) => {
    if (!activeNodeIds.has(nodeId)) {
      toRemove.push({ node, nodeId });
      domNodeRegistry.delete(nodeId);
    }
  });

  // 3) schedule each’s exit animation
  toRemove.forEach(({ node, nodeId }) => {
    const el = node.domNode;
    const exitClass = node.exitAnimationId;
    if (exitClass) {
      removeAnimatedNodeTree(el);
      console.log(toRemove.length);
      // listen → add class → on end remove
      const onEnd = (e) => {
        if (e.animationName === exitClass) {
          el.removeEventListener("animationend", onEnd);
          el.remove();
        }
      };
      el.addEventListener("animationend", onEnd);
      el.classList.add(exitClass);
    } else {
      // no animation, just yank it
      el.remove();
      // domNodeRegistry.delete(nodeId);
    }
  });
}

export function removeRouteSpecificNodes() {
  const path = window.location.pathname;
  const segments = path.split("/").filter(Boolean); // Remove empty strings
  const parentPath = "/" + segments.slice(0, -1).join("/");
  const fullLayoutPath = `layout-${parentPath}`;
  // Remove any nodes that aren't active in this render
  toRemove = [];
  domNodeRegistry.forEach((node, nodeId) => {
    if (nodeId !== fullLayoutPath) {
      toRemove.push({ node, nodeId });
      domNodeRegistry.delete(nodeId);
    }
  });

  // 3) schedule each’s exit animation
  toRemove.forEach(({ node, nodeId }) => {
    const el = node.domNode;
    const exitClass = node.exitAnimationId;
    if (exitClass) {
      removeAnimatedNodeTree(el);
      console.log(toRemove.length);
      // listen → add class → on end remove
      const onEnd = (e) => {
        if (e.animationName === exitClass) {
          el.removeEventListener("animationend", onEnd);
          el.remove();
        }
      };
      el.addEventListener("animationend", onEnd);
      el.classList.add(exitClass);
    } else {
      // no animation, just yank it
      el.remove();
      // domNodeRegistry.delete(nodeId);
    }
  });
}

// Function to read a RenderCommand from memory
// Essentially we are just reading out a giant memory file and using alignment
// and ptr to access the data then we convert the values to readable js values
export function readRenderCommand(offset, layout) {
  // const size = wasmInstance.getRenderCommandSize(offset);
  const view = new DataView(
    wasmInstance.memory.buffer,
    offset,
    layoutInfo.renderCommandSize,
  );

  const nodePtr = view.getUint32(layout.nodePtrOffset, true);
  const isDirty = wasmInstance.getDirtyValue(nodePtr);

  // Read BoundingBox
  const boundingBox = {
    x: view.getFloat32(layout.boundingBoxOffset, true),
    y: view.getFloat32(layout.boundingBoxOffset + 4, true),
    width: view.getFloat32(layout.boundingBoxOffset + 8, true),
    height: view.getFloat32(layout.boundingBoxOffset + 12, true),
  };

  // Read ElementType enum
  const elemType = view.getUint8(layout.elemTypeOffset);

  // For text, you need to handle the string slice differently
  const textPtr = view.getUint32(layout.textPtrOffset, true);
  const textLen = view.getUint32(layout.textLenOffset, true);
  const text = textPtr ? readWasmString(textPtr, textLen) : "";

  const hrefPtr = view.getUint32(layout.hrefPtrOffset, true);
  const hrefLen = view.getUint32(layout.hrefLenOffset, true);
  const href = hrefPtr ? readWasmString(hrefPtr, hrefLen) : "";

  const propsOffset = offset + layout.propsOffset;
  const propsView = new DataView(
    wasmInstance.memory.buffer,
    propsOffset, // propsOffset is relative to the start of RenderCommand
    layout.propsSize,
  );

  const btnId = propsView.getUint32(layout.propsBtnIdOffset, true);

  let css = "";
  let keyFrames = "";
  let styleId = "";
  let id = "";
  let dialogId = "";
  let hoverCss = "";
  let exitAnimationId = null;
  const show = view.getUint8(layout.showOffset, true);
  let hooks = {};

  const idPtr = view.getUint32(layout.idPtrOffset, true);
  const idLen = view.getUint32(layout.idLenOffset, true);
  id = idPtr ? readWasmString(idPtr, idLen) : "";

  if (isDirty) {
    const cssStylePtr = wasmInstance.getStyle(nodePtr);
    const cssStyleLen = wasmInstance.getStyleLen();
    css = readWasmString(cssStylePtr, cssStyleLen);

    hooks = {
      createdId: view.getUint32(layout.hooksOffset, true),
      mountedId: view.getUint32(layout.hooksOffset + 4, true),
      updatedId: view.getUint32(layout.hooksOffset + 8, true),
      destroyId: view.getUint32(layout.hooksOffset + 12, true),
    };

    const dialogIdPtr = propsView.getUint32(layout.dialogIdPtrOffset, true);
    const dialogIdLen = propsView.getUint32(layout.dialogIdLenOffset, true);
    dialogId = dialogIdPtr ? readWasmString(dialogIdPtr, dialogIdLen) : "";

    const propsHoverOffset = offset + layout.propsHoverOffset;
    const propsHoverView = new DataView(
      wasmInstance.memory.buffer,
      propsHoverOffset, // propsOffset is relative to the start of RenderCommand
      layout.propsHoverSize,
    );
    const hoverExists = propsHoverView.getUint8(0, true);
    if (hoverExists > 0) {
      const cssHoverPtr = wasmInstance.getHoverStyle(nodePtr);
      const cssHoverLen = wasmInstance.getHoverLen();
      hoverCss = readWasmString(cssHoverPtr, cssHoverLen);
    }

    const exitAnimPtr = propsView.getUint32(layout.propsExitAnimation, true);
    if (exitAnimPtr) {
      const exitAnimLen = propsView.getUint32(
        layout.propsExitAnimationLength,
        true,
      );
      exitAnimationId = readWasmString(exitAnimPtr, exitAnimLen);
    }

    const styleIdPtr = propsView.getUint32(layout.propsStyleId, true);
    if (styleIdPtr) {
      const styleIdLen = propsView.getUint32(layout.propsStyleIdLength, true);
      styleId = readWasmString(styleIdPtr, styleIdLen);
    }

    if (wasmInstance.hasEctClasses(nodePtr)) {
      wasmInstance.addEctClasses(nodePtr);
    }
  }

  const props = {
    css,
    hoverCss,
    btnId,
    dialogId,
    keyFrames,
  };

  return {
    boundingBox,
    elemType,
    text,
    href,
    props,
    id,
    show,
    hooks,
    nodePtr,
    exitAnimationId,
    styleId,
    isDirty,
    // ... other fields
  };
}

export function readWasmString(ptr, len) {
  const bytes = new Uint8Array(wasmInstance.memory.buffer, ptr, len);
  return new TextDecoder().decode(bytes);
}

initWasi();
