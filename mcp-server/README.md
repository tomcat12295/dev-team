# dev-team-mcp-server

[![npm version](https://img.shields.io/npm/v/dev-team-mcp-server)](https://www.npmjs.com/package/dev-team-mcp-server)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Multi-agent development team system for [Claude Code](https://claude.ai/claude-code) — orchestrate PM, Leader, and Member roles via MCP with WezTerm integration.

Multiple Claude Code instances work as a "development team" with a hierarchical structure (PM → Leader → Members), event-driven file-based communication, and zero API consumption during idle.

## Prerequisites

- **Node.js** 18+
- **WezTerm** 20230326+ (terminal multiplexer)
- **Claude Code CLI** v2.1.0+
- **Windows OS**

## Install

```bash
npm install -g dev-team-mcp-server
```

## Quick Start

### 1. Initialize project

```bash
dev-team init /path/to/your-project
```

This creates the `.dev-team/` directory structure with workspace configurations.

### 2. Configure MCP

Add to your `~/.mcp.json`:

```json
{
  "mcpServers": {
    "dev-team": {
      "command": "dev-team-mcp-server",
      "args": []
    }
  }
}
```

### 3. Start the team

```bash
dev-team start /path/to/your-project "Implement user authentication"
```

This opens WezTerm panes for each role (PM, Leader, Member-01, Member-02) and starts the team session.

### 4. Manage the team

```bash
# Add members
dev-team add-member /path/to/your-project --count 1

# Remove members
dev-team remove-member /path/to/your-project --count 1

# Stop the team
dev-team stop /path/to/your-project
```

## Environment Variables

Set automatically by `dev-team start`. Manual configuration is not required.

| Variable | Description | Example |
|----------|-------------|---------|
| `DEV_TEAM_ROLE` | Agent role | `pm`, `leader`, `member-01` |
| `DEV_TEAM_PROJECT_PATH` | Project path | `/path/to/project` |
| `DEV_TEAM_LOG_LEVEL` | Log level (optional) | `debug`, `info`, `warn`, `error` |

## Tools

### Basic Operations

| Tool | Who | Description |
|------|-----|-------------|
| `check_queue` | All | Check task queue for incoming messages |
| `send_task` | All (restricted) | Send task/message to another role |
| `get_dashboard` | All | Get project progress dashboard |
| `health_check` | All | Check system status |

### Task Management

| Tool | Who | Description |
|------|-----|-------------|
| `assign_task` | Leader | Assign structured task to a member |
| `distribute_tasks` | Leader | Distribute multiple subtasks at once |
| `submit_plan` | Member | Submit implementation plan for review |
| `approve_plan` | Leader | Approve member's plan |
| `reject_plan` | Leader | Reject member's plan with feedback |
| `submit_test` | Member | Submit test code for review (strict mode) |
| `approve_test` | Leader | Approve member's test code |
| `reject_test` | Leader | Reject member's test code |
| `update_task_status` | PM, Leader | Update task status |

### Backlog

| Tool | Who | Description |
|------|-----|-------------|
| `add_backlog` | PM | Add task to backlog |
| `get_backlog` | All | Get backlog task list |
| `update_backlog` | PM | Update backlog task status |

### Memory & Context

| Tool | Who | Description |
|------|-----|-------------|
| `save_memory` | All | Save decisions and notes |
| `recall_memory` | All | Search and retrieve memories |
| `get_project_context` | All | Get project context |
| `update_project_context` | PM, Leader | Update project context |

### Approval

| Tool | Who | Description |
|------|-----|-------------|
| `request_approval` | PM | Request approval from user |
| `process_approval` | PM | Process approval request |

### Configuration

| Tool | Who | Description |
|------|-----|-------------|
| `configure_modes` | PM | Configure review mode and task split approval |

### Member Management

| Tool | Who | Description |
|------|-----|-------------|
| `request_member_increase` | Leader | Request member increase |
| `request_member_decrease` | Leader | Request member decrease |

### Agent Control

| Tool | Who | Description |
|------|-----|-------------|
| `compact_agent` | PM, Leader | Send /compact to a role |
| `clear_agent` | PM, Leader | Send /clear to a role |
| `compact_all` | PM, Leader | Send /compact to all roles |
| `archive_all_tasks` | PM | Archive all tasks |

## CLI Commands

| Command | Description |
|---------|-------------|
| `dev-team init [path]` | Initialize project structure |
| `dev-team start <path> [task]` | Start team session |
| `dev-team stop <path>` | Stop team session |
| `dev-team add-member <path>` | Add members to session |
| `dev-team remove-member <path>` | Remove members from session |
| `dev-team --version` | Show version |

## License

[MIT](https://github.com/tomcat12295/dev-team/blob/master/LICENSE)

## Links

- [GitHub Repository](https://github.com/tomcat12295/dev-team)
- [Bug Reports](https://github.com/tomcat12295/dev-team/issues)
