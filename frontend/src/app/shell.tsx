/**
 * Root layout shell.
 *
 * Renders a persistent two-panel layout:
 *   [ ConversationSidebar (collapsible) ] [ <Outlet /> (active route) ]
 *
 * The sidebar never unmounts — switching conversations only changes the outlet.
 * Panel sizes are persisted to localStorage via autoSaveId.
 *
 * See project-memory/frontend-architecture.md § Layout for full rationale.
 */

import { Outlet } from '@tanstack/react-router'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { ConversationSidebar } from '@/features/conversations/ConversationSidebar'

export function Shell() {
  return (
    <PanelGroup
      direction="horizontal"
      autoSaveId="shell-layout"
      className="cf-shell"
    >
      <Panel
        id="sidebar"
        collapsible
        minSize={15}
        defaultSize={20}
        style={{ overflow: 'hidden' }}
      >
        <ConversationSidebar />
      </Panel>

      <PanelResizeHandle
        className="cf-resize-handle"
        style={{ width: '1px', minWidth: '1px', flex: '0 0 1px', alignSelf: 'stretch' }}
      />

      <Panel id="main" minSize={30} style={{ overflow: 'hidden' }}>
        <Outlet />
      </Panel>
    </PanelGroup>
  )
}
