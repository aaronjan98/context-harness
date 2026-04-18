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
      style={{ height: '100vh' }}
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

      <PanelResizeHandle style={{ width: 4, background: '#e5e7eb', cursor: 'col-resize' }} />

      <Panel id="main" minSize={30} style={{ overflow: 'hidden' }}>
        <Outlet />
      </Panel>
    </PanelGroup>
  )
}
