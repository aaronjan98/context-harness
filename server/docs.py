"""Customized API documentation pages for Context Forge."""

from fastapi.openapi.docs import get_swagger_ui_html
from fastapi.responses import HTMLResponse


SWAGGER_DARK_THEME = """
<style>
  :root {
    color-scheme: dark;
    --cf-bg: #0f172a;
    --cf-panel: #111827;
    --cf-panel-strong: #1f2937;
    --cf-border: #334155;
    --cf-text: #e5e7eb;
    --cf-muted: #cbd5e1;
    --cf-accent: #60a5fa;
    --cf-accent-2: #67e8f9;
  }

  body {
    margin: 0;
    background: var(--cf-bg) !important;
  }

  .swagger-ui,
  .swagger-ui .wrapper,
  .swagger-ui .scheme-container,
  .swagger-ui section.models,
  .swagger-ui .opblock,
  .swagger-ui .dialog-ux .modal-ux,
  .swagger-ui .information-container,
  .swagger-ui .try-out__btn,
  .swagger-ui .tab,
  .swagger-ui .tab li,
  .swagger-ui .opblock-summary,
  .swagger-ui .opblock-section-header,
  .swagger-ui .parameters-container,
  .swagger-ui .responses-wrapper,
  .swagger-ui .responses-inner,
  .swagger-ui .response,
  .swagger-ui .response-col_links,
  .swagger-ui .prop-type,
  .swagger-ui .prop-format,
  .swagger-ui .description,
  .swagger-ui .parameter__name,
  .swagger-ui .parameter__type,
  .swagger-ui .renderedMarkdown,
  .swagger-ui .model-title,
  .swagger-ui .model,
  .swagger-ui .opblock-description-wrapper,
  .swagger-ui .btn,
  .swagger-ui .btn:hover,
  .swagger-ui .btn:focus,
  .swagger-ui input,
  .swagger-ui textarea,
  .swagger-ui select {
    background-color: transparent !important;
    color: var(--cf-text);
    font-family: "IBM Plex Sans", "Aptos", "Noto Sans", sans-serif;
  }

  .swagger-ui svg,
  .swagger-ui svg *,
  .swagger-ui .expand-operation svg,
  .swagger-ui .opblock-summary-control svg,
  .swagger-ui .opblock-control-arrow svg,
  .swagger-ui .arrow svg {
    fill: currentColor !important;
    color: var(--cf-text) !important;
  }

  .swagger-ui .wrapper {
    max-width: 1120px;
  }

  .swagger-ui .topbar {
    background: rgba(15, 23, 42, 0.98);
    border-bottom: 1px solid var(--cf-border);
  }

  .swagger-ui .topbar-wrapper img,
  .swagger-ui .topbar-wrapper svg {
    filter: invert(1) hue-rotate(180deg);
  }

  .swagger-ui .info,
  .swagger-ui .info .title,
  .swagger-ui .info h1,
  .swagger-ui .info h2,
  .swagger-ui .info h3,
  .swagger-ui .info p,
  .swagger-ui .opblock-tag,
  .swagger-ui table thead tr td,
  .swagger-ui table thead tr th,
  .swagger-ui .response-col_status,
  .swagger-ui .response-col_description,
  .swagger-ui label {
    color: var(--cf-text);
  }

  .swagger-ui .info {
    margin: 36px 0;
  }

  .swagger-ui .info .title small {
    background: rgba(96, 165, 250, 0.16);
    color: var(--cf-accent-2);
  }

  .swagger-ui .scheme-container,
  .swagger-ui section.models,
  .swagger-ui .opblock,
  .swagger-ui .dialog-ux .modal-ux {
    border: 1px solid var(--cf-border);
    border-radius: 10px;
    background: var(--cf-panel);
    box-shadow: none;
    overflow: hidden;
  }

  .swagger-ui .opblock .opblock-summary {
    border-color: var(--cf-border);
  }

  .swagger-ui .opblock.opblock-get,
  .swagger-ui .opblock.opblock-post,
  .swagger-ui .opblock.opblock-patch {
    border-color: var(--cf-border);
    background: var(--cf-panel);
  }

  .swagger-ui .opblock-summary,
  .swagger-ui .opblock-summary-control,
  .swagger-ui .opblock-section-header {
    background: var(--cf-panel-strong) !important;
    border-radius: 0 !important;
  }

  .swagger-ui .tab-header,
  .swagger-ui .tab-item,
  .swagger-ui .tab-item.active,
  .swagger-ui .tab-item.active h4,
  .swagger-ui .opblock-title,
  .swagger-ui .opblock-title span {
    background: transparent !important;
    border: 0 !important;
    border-bottom: 0 !important;
    box-shadow: none !important;
    text-decoration: none !important;
  }

  .swagger-ui .tab-item.active::after,
  .swagger-ui .tab-item.active::before {
    display: none !important;
    content: none !important;
  }

  .swagger-ui button:focus,
  .swagger-ui button:focus-visible,
  .swagger-ui button:active,
  .swagger-ui .btn:focus,
  .swagger-ui .btn:focus-visible,
  .swagger-ui .btn:active,
  .swagger-ui .try-out__btn:focus,
  .swagger-ui .try-out__btn:focus-visible,
  .swagger-ui .try-out__btn:active,
  .swagger-ui .models-control:focus,
  .swagger-ui .models-control:focus-visible,
  .swagger-ui .models-control:active,
  .swagger-ui .json-schema-2020-12-accordion:focus,
  .swagger-ui .json-schema-2020-12-accordion:focus-visible,
  .swagger-ui .json-schema-2020-12-accordion:active,
  .swagger-ui .json-schema-2020-12-expand-deep-button:focus,
  .swagger-ui .json-schema-2020-12-expand-deep-button:focus-visible,
  .swagger-ui .json-schema-2020-12-expand-deep-button:active {
    outline: none !important;
    box-shadow: none !important;
    border-color: transparent !important;
  }

  .swagger-ui [class^="json-schema-2020-12"],
  .swagger-ui [class^="json-schema-2020-12"] * {
    color: var(--cf-text) !important;
    background: transparent !important;
  }

  .swagger-ui .json-schema-2020-12-head {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .swagger-ui .json-schema-2020-12-accordion,
  .swagger-ui .json-schema-2020-12-expand-deep-button {
    border: 0 !important;
    border-radius: 0 !important;
    padding: 0.25rem 0 !important;
    background: transparent !important;
    color: var(--cf-text) !important;
    box-shadow: none !important;
  }

  .swagger-ui .json-schema-2020-12-accordion {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .swagger-ui .json-schema-2020-12-accordion__children {
    background: transparent !important;
  }

  .swagger-ui .json-schema-2020-12__title,
  .swagger-ui .json-schema-2020-12__attribute,
  .swagger-ui .json-schema-2020-12__attribute--primary,
  .swagger-ui .json-schema-2020-12-expand-deep-button {
    color: var(--cf-text) !important;
  }

  .swagger-ui .json-schema-2020-12__attribute--primary {
    font-weight: 600;
  }

  .swagger-ui .json-schema-2020-12-accordion__icon svg,
  .swagger-ui .json-schema-2020-12-accordion__icon path {
    fill: currentColor !important;
    color: var(--cf-text) !important;
  }

  .swagger-ui .json-schema-2020-12-accordion:hover,
  .swagger-ui .json-schema-2020-12-expand-deep-button:hover {
    color: var(--cf-accent) !important;
  }

  .swagger-ui .opblock.opblock-get .opblock-summary-method {
    background: #2563eb;
  }

  .swagger-ui .opblock.opblock-post .opblock-summary-method {
    background: #7c3aed;
    color: #f8fafc;
  }

  .swagger-ui .opblock.opblock-patch .opblock-summary-method {
    background: #0ea5e9;
    color: #f8fafc;
  }

  .swagger-ui .opblock .opblock-summary-path,
  .swagger-ui .opblock .opblock-summary-description,
  .swagger-ui .opblock-description-wrapper p,
  .swagger-ui .opblock-section-header h4,
  .swagger-ui .opblock-section-header h4 *,
  .swagger-ui .opblock-section-header h4 span,
  .swagger-ui .opblock-section-header > label,
  .swagger-ui .opblock-section-header > label *,
  .swagger-ui .opblock-section-header button,
  .swagger-ui .opblock-section-header button *,
  .swagger-ui .opblock-section-header a,
  .swagger-ui .opblock-section-header a *,
  .swagger-ui .responses-inner h4,
  .swagger-ui .responses-inner h5,
  .swagger-ui .responses-inner h4 *,
  .swagger-ui .responses-inner h5 *,
  .swagger-ui .responses-inner .response-col_status,
  .swagger-ui .responses-inner .response-col_description,
  .swagger-ui .responses-inner .response-col_links,
  .swagger-ui .opblock-title,
  .swagger-ui .opblock-title *,
  .swagger-ui .opblock-title span,
  .swagger-ui .tab-header,
  .swagger-ui .tab-header *,
  .swagger-ui .tab-item,
  .swagger-ui .tab-item *,
  .swagger-ui .tab-item.active,
  .swagger-ui .tab-item.active *,
  .swagger-ui .try-out,
  .swagger-ui .try-out *,
  .swagger-ui .try-out__btn,
  .swagger-ui .model-title,
  .swagger-ui .model-title a,
  .swagger-ui .model,
  .swagger-ui .model-box,
  .swagger-ui .model-box *,
  .swagger-ui .schema .prop,
  .swagger-ui .schema .prop span,
  .swagger-ui .schema .prop-type,
  .swagger-ui .schema .prop-format,
  .swagger-ui .schema h5,
  .swagger-ui .schema h6,
  .swagger-ui .model .property,
  .swagger-ui .model .property *,
  .swagger-ui .model .property code,
  .swagger-ui .model .property pre,
  .swagger-ui .model .property span,
  .swagger-ui .model .property a,
  .swagger-ui .model-box .model,
  .swagger-ui .model-box .model *,
  .swagger-ui .model-box .model code,
  .swagger-ui .model-box .model pre,
  .swagger-ui .model-box .model span,
  .swagger-ui .model-box .model a {
    color: var(--cf-text);
    background: transparent !important;
  }

  .swagger-ui .opblock-section-header h4,
  .swagger-ui .opblock-section-header h4 *,
  .swagger-ui .responses-inner h4,
  .swagger-ui .responses-inner h4 *,
  .swagger-ui .responses-inner h5,
  .swagger-ui .responses-inner h5 *,
  .swagger-ui .responses-inner .response-col_status,
  .swagger-ui .responses-inner .response-col_description,
  .swagger-ui .responses-inner .response-col_links,
  .swagger-ui .models-control,
  .swagger-ui .models-control *,
  .swagger-ui .models-control span,
  .swagger-ui .models-control svg,
  .swagger-ui .models-control path {
    color: var(--cf-text) !important;
  }

  .swagger-ui .models-control {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    border: 0 !important;
    border-radius: 0 !important;
    padding: 0 !important;
    background: transparent !important;
    color: var(--cf-text) !important;
    box-shadow: none !important;
  }

  .swagger-ui .models-control span,
  .swagger-ui .models-control *,
  .swagger-ui .models-control svg,
  .swagger-ui .models-control path {
    color: var(--cf-text) !important;
    fill: currentColor !important;
    background: transparent !important;
  }

  .swagger-ui .models-control:hover {
    color: var(--cf-accent) !important;
  }

  .swagger-ui .try-out__btn {
    border: 0 !important;
    border-radius: 0 !important;
    background: transparent !important;
    color: var(--cf-text) !important;
    padding: 0 !important;
    box-shadow: none !important;
  }

  .swagger-ui .try-out__btn:hover {
    color: var(--cf-accent) !important;
  }

  .swagger-ui input,
  .swagger-ui textarea,
  .swagger-ui select {
    border: 1px solid var(--cf-border);
    background: #0b1220 !important;
    color: var(--cf-text);
  }

  .swagger-ui .btn,
  .swagger-ui .btn.authorize {
    border-color: var(--cf-border);
    color: var(--cf-text);
  }

  .swagger-ui .btn.execute {
    border-color: rgba(103, 232, 249, 0.45);
    background: rgba(103, 232, 249, 0.12);
    color: var(--cf-accent-2);
  }

  .swagger-ui .highlight-code,
  .swagger-ui .microlight,
  .swagger-ui pre,
  .swagger-ui pre code,
  .swagger-ui code,
  .swagger-ui .example,
  .swagger-ui .body-param__example,
  .swagger-ui .body-param__example code,
  .swagger-ui .model-example,
  .swagger-ui .model-example .highlight-code,
  .swagger-ui .model-example .example,
  .swagger-ui .model-example .microlight,
  .swagger-ui .model-example pre,
  .swagger-ui .model-example pre code,
  .swagger-ui .model-example code[class*="language-"],
  .swagger-ui pre[style],
  .swagger-ui code[style] {
    border-radius: 8px;
    background: #020617 !important;
    color: #e5e7eb !important;
  }

  .swagger-ui .highlight-code .hljs-comment,
  .swagger-ui .highlight-code .hljs-quote {
    color: #94a3b8 !important;
  }

  .swagger-ui .highlight-code .hljs-keyword,
  .swagger-ui .highlight-code .hljs-selector-tag,
  .swagger-ui .highlight-code .hljs-title,
  .swagger-ui .highlight-code .hljs-section {
    color: #60a5fa !important;
  }

  .swagger-ui .highlight-code .hljs-string,
  .swagger-ui .highlight-code .hljs-attr,
  .swagger-ui .highlight-code .hljs-number,
  .swagger-ui .highlight-code .hljs-literal {
    color: #67e8f9 !important;
  }

  .swagger-ui .highlight-code .hljs-attribute,
  .swagger-ui .highlight-code .hljs-built_in,
  .swagger-ui .highlight-code .hljs-bullet {
    color: #fbbf24 !important;
  }

  .swagger-ui .highlight-code .hljs,
  .swagger-ui .microlight,
  .swagger-ui pre code,
  .swagger-ui pre,
  .swagger-ui code,
  .swagger-ui pre span,
  .swagger-ui code span {
    color: #e5e7eb !important;
  }

  .swagger-ui .model-box,
  .swagger-ui section.models .model-container {
    border-color: var(--cf-border);
    border-radius: 8px;
    background: #111827;
  }

  .swagger-ui .model-box .model-box,
  .swagger-ui .model-box .brace-expander,
  .swagger-ui .model-box .body-param,
  .swagger-ui .model-box .model,
  .swagger-ui .model-box .models,
  .swagger-ui .model-box .schema,
  .swagger-ui .model-box .property {
    background: transparent !important;
  }

  .swagger-ui .models-control svg,
  .swagger-ui .model-box svg,
  .swagger-ui .model-toggle svg,
  .swagger-ui .prop-type svg,
  .swagger-ui .parameter__name svg {
    fill: currentColor !important;
    color: var(--cf-muted) !important;
  }

  .swagger-ui .model-box,
  .swagger-ui .model-container,
  .swagger-ui .model-title,
  .swagger-ui .model-title a,
  .swagger-ui .model-title span,
  .swagger-ui .models-control,
  .swagger-ui .models-control *,
  .swagger-ui .parameter__name,
  .swagger-ui .parameter__name *,
  .swagger-ui .parameter__value,
  .swagger-ui .parameter__value *,
  .swagger-ui .response-col_description,
  .swagger-ui .response-col_description *,
  .swagger-ui .response-col_links,
  .swagger-ui .response-col_links *,
  .swagger-ui .responses-inner td,
  .swagger-ui .responses-inner td *,
  .swagger-ui .tab li,
  .swagger-ui .tab li *,
  .swagger-ui .model-box .property,
  .swagger-ui .model-box .property *,
  .swagger-ui .model-box .prop,
  .swagger-ui .model-box .prop *,
  .swagger-ui .model-box .schema,
  .swagger-ui .model-box .schema *,
  .swagger-ui .model-box .markdown,
  .swagger-ui .model-box .markdown * {
    color: var(--cf-text);
    background: transparent !important;
  }
</style>
"""


def get_context_forge_docs_html(openapi_url: str, title: str) -> HTMLResponse:
    """Return Swagger UI HTML with Context Forge dark theme CSS injected."""
    response = get_swagger_ui_html(
        openapi_url=openapi_url,
        title=f"{title} - API Docs",
        swagger_ui_parameters={
            "deepLinking": True,
            "displayRequestDuration": True,
            "syntaxHighlight.theme": "obsidian",
        },
    )
    html = response.body.decode("utf-8").replace("</head>", f"{SWAGGER_DARK_THEME}</head>")
    return HTMLResponse(html)
