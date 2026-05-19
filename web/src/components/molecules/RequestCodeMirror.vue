<script setup lang="ts">
import { onMounted, onBeforeUnmount, watch, shallowRef, ref } from "vue";
import { Compartment, EditorState } from "@codemirror/state";
import { basicSetup, minimalSetup } from "codemirror";
import { EditorView, lineNumbers } from "@codemirror/view";
import { json } from "@codemirror/lang-json";
import { xml } from "@codemirror/lang-xml";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";

export type CmLanguage = "json" | "text" | "xml" | "html" | "javascript";

const props = withDefaults(
  defineProps<{
    modelValue: string;
    language: CmLanguage;
    readonly?: boolean;
    /** false = minimalSetup + line numbers (ответ); true = полный basicSetup */
    rich?: boolean;
  }>(),
  { readonly: false, rich: true }
);

const emit = defineEmits<{
  "update:modelValue": [v: string];
}>();

const root = ref<HTMLElement | null>(null);
const view = shallowRef<EditorView | null>(null);
const themeConf = new Compartment();
const languageConf = new Compartment();
const readOnlyConf = new Compartment();

function readCssVars() {
  const s = getComputedStyle(document.documentElement);
  return {
    bg: s.getPropertyValue("--bg-code").trim() || "#eef1f7",
    bgGutter: s.getPropertyValue("--chrome-nav").trim() || "#f7f8fa",
    fg: s.getPropertyValue("--text-primary").trim() || "#1a2233",
    muted: s.getPropertyValue("--text-muted").trim() || "#7b8798",
    border: s.getPropertyValue("--chrome-divider").trim() || "#dfe3e8",
    accent: s.getPropertyValue("--accent-2").trim() || "#5b5bd6",
    selection: s.getPropertyValue("--accent-2-muted").trim() || "rgba(91, 91, 214, 0.15)",
  };
}

function buildTheme() {
  const t = readCssVars();
  return EditorView.theme(
    {
      "&": {
        height: "100%",
        backgroundColor: t.bg,
        color: t.fg,
      },
      ".cm-scroller": {
        fontFamily: "var(--font-mono, ui-monospace, monospace)",
        fontSize: "12px",
        lineHeight: "1.45",
      },
      ".cm-content": { caretColor: t.accent, paddingBlock: "6px" },
      ".cm-gutters": {
        backgroundColor: t.bgGutter,
        color: t.muted,
        borderRight: `1px solid ${t.border}`,
        borderTopLeftRadius: "var(--radius-sm, 5px)",
        borderBottomLeftRadius: "var(--radius-sm, 5px)",
      },
      ".cm-activeLineGutter": { backgroundColor: "rgba(0,0,0,0.04)" },
      ".cm-activeLine": { backgroundColor: "rgba(0,0,0,0.03)" },
      ".cm-selectionBackground": { backgroundColor: t.selection },
      "&.cm-focused .cm-selectionBackground": { backgroundColor: t.selection },
      ".cm-cursor, .cm-dropCursor": { borderLeftColor: t.accent },
      ".cm-foldPlaceholder": {
        backgroundColor: t.bg,
        border: `1px solid ${t.border}`,
      },
    },
    { dark: false }
  );
}

function langExtension(lang: CmLanguage) {
  switch (lang) {
    case "json":
      return json();
    case "xml":
      return xml();
    case "html":
      return html();
    case "javascript":
      return javascript({ jsx: false, typescript: false });
    default:
      return [];
  }
}

function buildExtensions() {
  const setup =
    props.readonly && !props.rich
      ? [minimalSetup, lineNumbers(), EditorView.lineWrapping]
      : [basicSetup];
  return [
    themeConf.of(buildTheme()),
    languageConf.of(langExtension(props.language)),
    readOnlyConf.of(EditorState.readOnly.of(!!props.readonly)),
    ...setup,
    EditorView.updateListener.of((u) => {
      if (!props.readonly && u.docChanged) {
        emit("update:modelValue", u.state.doc.toString());
      }
    }),
  ];
}

let themeObserver: MutationObserver | null = null;

function applyTheme() {
  const v = view.value;
  if (!v) return;
  v.dispatch({
    effects: themeConf.reconfigure(buildTheme()),
  });
}

onMounted(() => {
  if (!root.value) return;
  const state = EditorState.create({
    doc: props.modelValue,
    extensions: buildExtensions(),
  });
  view.value = new EditorView({ state, parent: root.value });
  themeObserver = new MutationObserver(() => applyTheme());
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
});

onBeforeUnmount(() => {
  themeObserver?.disconnect();
  themeObserver = null;
  view.value?.destroy();
  view.value = null;
});

watch(
  () => props.modelValue,
  (next) => {
    const v = view.value;
    if (!v) return;
    const cur = v.state.doc.toString();
    if (next === cur) return;
    v.dispatch({
      changes: { from: 0, to: v.state.doc.length, insert: next },
    });
  }
);

watch(
  () => props.language,
  (lang) => {
    const v = view.value;
    if (!v) return;
    v.dispatch({
      effects: languageConf.reconfigure(langExtension(lang)),
    });
  }
);

watch(
  () => props.readonly,
  (ro) => {
    const v = view.value;
    if (!v) return;
    v.dispatch({
      effects: readOnlyConf.reconfigure(EditorState.readOnly.of(!!ro)),
    });
  }
);
</script>

<template>
  <div ref="root" class="request-cm" />
</template>

<style scoped>
.request-cm {
  flex: 1;
  min-height: 180px;
  height: 100%;
  width: 100%;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-sm);
  overflow: hidden;
  background: var(--bg-code);
}
.request-cm :deep(.cm-editor) {
  height: 100%;
}
.request-cm :deep(.cm-scroller) {
  min-height: 180px;
}
</style>
