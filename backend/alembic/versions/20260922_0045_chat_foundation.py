"""Chat module foundation: channel accounts, branch assignments, conversations, messages.

Revision ID: 20260922_0045
Revises: 20260922_0044
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260922_0045"
down_revision: str | Sequence[str] | None = "20260922_0044"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_PERMISSION_CODES = ("chat.read", "chat.send")


def _id_column() -> sa.Column[object]:
    return sa.Column("id", sa.Uuid(), server_default=sa.text("uuidv7()"), nullable=False)


def _created_at_column() -> sa.Column[object]:
    return sa.Column(
        "created_at",
        sa.DateTime(timezone=True),
        server_default=sa.text("now()"),
        nullable=False,
    )


def _updated_at_column() -> sa.Column[object]:
    return sa.Column(
        "updated_at",
        sa.DateTime(timezone=True),
        server_default=sa.text("now()"),
        nullable=False,
    )


def _version_column() -> sa.Column[object]:
    return sa.Column("version", sa.Integer(), server_default=sa.text("1"), nullable=False)


def upgrade() -> None:
    op.create_table(
        "chat_channel_accounts",
        _id_column(),
        sa.Column("workspace_id", sa.Uuid(), nullable=False),
        sa.Column("channel", sa.String(length=16), nullable=False),
        sa.Column("provider_account_id", sa.String(length=128), nullable=False),
        sa.Column("display_name", sa.String(length=160), server_default="", nullable=False),
        sa.Column("access_token_ciphertext", sa.Text(), nullable=True),
        sa.Column("token_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "connection_status",
            sa.String(length=16),
            server_default=sa.text("'disconnected'"),
            nullable=False,
        ),
        _created_at_column(),
        _updated_at_column(),
        _version_column(),
        sa.CheckConstraint(
            "channel IN ('instagram', 'whatsapp')",
            name=op.f("ck_chat_channel_accounts_channel"),
        ),
        sa.CheckConstraint(
            "connection_status IN ('disconnected', 'connected', 'error')",
            name=op.f("ck_chat_channel_accounts_connection_status"),
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id"],
            ["workspaces.id"],
            name=op.f("fk_chat_channel_accounts_workspace_id_workspaces"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_chat_channel_accounts")),
        sa.UniqueConstraint("workspace_id", "id", name="uq_chat_channel_accounts_workspace_id"),
        sa.UniqueConstraint(
            "workspace_id",
            "channel",
            "provider_account_id",
            name="uq_chat_channel_accounts_workspace_channel_provider",
        ),
    )
    op.create_index(
        "ix_chat_channel_accounts_workspace_channel",
        "chat_channel_accounts",
        ["workspace_id", "channel"],
    )

    op.create_table(
        "chat_channel_account_branches",
        sa.Column("channel_account_id", sa.Uuid(), nullable=False),
        sa.Column("workspace_id", sa.Uuid(), nullable=False),
        sa.Column("branch_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(
            ["workspace_id", "channel_account_id"],
            ["chat_channel_accounts.workspace_id", "chat_channel_accounts.id"],
            name="fk_chat_channel_account_branches_workspace_account",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "branch_id"],
            ["branches.workspace_id", "branches.id"],
            name="fk_chat_channel_account_branches_workspace_branch",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint(
            "channel_account_id",
            "branch_id",
            name=op.f("pk_chat_channel_account_branches"),
        ),
    )
    op.create_index(
        "ix_chat_channel_account_branches_workspace_branch",
        "chat_channel_account_branches",
        ["workspace_id", "branch_id"],
    )

    op.create_table(
        "chat_conversations",
        _id_column(),
        sa.Column("workspace_id", sa.Uuid(), nullable=False),
        sa.Column("channel_account_id", sa.Uuid(), nullable=False),
        sa.Column("provider_thread_id", sa.String(length=128), nullable=False),
        sa.Column("participant_provider_id", sa.String(length=128), nullable=False),
        sa.Column("participant_display_name", sa.String(length=160), server_default="", nullable=False),
        sa.Column("last_message_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_message_preview", sa.String(length=280), server_default="", nullable=False),
        _created_at_column(),
        _updated_at_column(),
        _version_column(),
        sa.ForeignKeyConstraint(
            ["workspace_id", "channel_account_id"],
            ["chat_channel_accounts.workspace_id", "chat_channel_accounts.id"],
            name="fk_chat_conversations_workspace_account",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_chat_conversations")),
        sa.UniqueConstraint("workspace_id", "id", name="uq_chat_conversations_workspace_id"),
        sa.UniqueConstraint(
            "workspace_id",
            "channel_account_id",
            "provider_thread_id",
            name="uq_chat_conversations_workspace_account_thread",
        ),
    )
    op.create_index(
        "ix_chat_conversations_workspace_account_last_message",
        "chat_conversations",
        ["workspace_id", "channel_account_id", "last_message_at"],
    )

    op.create_table(
        "chat_messages",
        _id_column(),
        sa.Column("workspace_id", sa.Uuid(), nullable=False),
        sa.Column("conversation_id", sa.Uuid(), nullable=False),
        sa.Column("provider_message_id", sa.String(length=128), nullable=False),
        sa.Column("direction", sa.String(length=16), nullable=False),
        sa.Column("body_text", sa.Text(), server_default="", nullable=False),
        sa.Column(
            "delivery_status",
            sa.String(length=16),
            server_default=sa.text("'received'"),
            nullable=False,
        ),
        _created_at_column(),
        sa.CheckConstraint(
            "direction IN ('inbound', 'outbound')",
            name=op.f("ck_chat_messages_direction"),
        ),
        sa.CheckConstraint(
            "delivery_status IN ('received', 'sent', 'failed', 'pending')",
            name=op.f("ck_chat_messages_delivery_status"),
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "conversation_id"],
            ["chat_conversations.workspace_id", "chat_conversations.id"],
            name="fk_chat_messages_workspace_conversation",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_chat_messages")),
        sa.UniqueConstraint("workspace_id", "id", name="uq_chat_messages_workspace_id"),
        sa.UniqueConstraint(
            "workspace_id",
            "provider_message_id",
            name="uq_chat_messages_workspace_provider_message",
        ),
    )
    op.create_index(
        "ix_chat_messages_workspace_conversation_created",
        "chat_messages",
        ["workspace_id", "conversation_id", "created_at"],
    )

    _install_chat_catalogs()


def _install_chat_catalogs() -> None:
    op.execute(
        """
        INSERT INTO module_definitions (code, name, kind, status, dependency_codes)
        VALUES ('chat', 'Chat', 'optional', 'available', '["foundation", "crm"]')
        ON CONFLICT (code) DO UPDATE SET
            name = EXCLUDED.name,
            kind = EXCLUDED.kind,
            status = EXCLUDED.status,
            dependency_codes = EXCLUDED.dependency_codes,
            updated_at = now()
        """
    )
    op.execute(
        """
        INSERT INTO permissions
            (code, module_code, action, name, description, sort_order, is_platform_only)
        VALUES
            ('chat.read', 'chat', 'read', 'Ver chat',
             'View Instagram and WhatsApp inbox threads for authorized branches.', 10, false),
            ('chat.send', 'chat', 'send', 'Enviar mensajes de chat',
             'Send replies in authorized Instagram and WhatsApp conversations.', 20, false)
        ON CONFLICT (code) DO UPDATE SET
            module_code = EXCLUDED.module_code,
            action = EXCLUDED.action,
            name = EXCLUDED.name,
            description = EXCLUDED.description,
            sort_order = EXCLUDED.sort_order,
            is_platform_only = EXCLUDED.is_platform_only,
            updated_at = now()
        """
    )
    op.execute(
        f"""
        INSERT INTO role_permissions (workspace_id, role_id, permission_id)
        SELECT role.workspace_id, role.id, permission.id
        FROM roles AS role
        CROSS JOIN permissions AS permission
        WHERE role.code = 'workspace_admin'
          AND role.status = 'active'
          AND permission.code IN ({", ".join(f"'{code}'" for code in _PERMISSION_CODES)})
        ON CONFLICT (workspace_id, role_id, permission_id) DO NOTHING
        """
    )
    op.execute(
        """
        INSERT INTO module_entitlements
            (workspace_id, module_definition_id, status, effective_from)
        SELECT workspace.id, module.id, 'enabled', now()
        FROM workspaces AS workspace
        JOIN module_definitions AS module ON module.code = 'chat'
        ON CONFLICT (workspace_id, module_definition_id) DO NOTHING
        """
    )


def downgrade() -> None:
    op.execute(
        f"""
        DELETE FROM role_permissions
        WHERE permission_id IN (
            SELECT id FROM permissions
            WHERE code IN ({", ".join(f"'{code}'" for code in _PERMISSION_CODES)})
        )
        """
    )
    op.execute(
        """
        DELETE FROM module_entitlements
        WHERE module_definition_id = (
            SELECT id FROM module_definitions WHERE code = 'chat'
        )
        """
    )
    op.execute(
        f"DELETE FROM permissions WHERE code IN ({', '.join(f"'{c}'" for c in _PERMISSION_CODES)})"
    )
    op.execute("UPDATE module_definitions SET status = 'planned' WHERE code = 'chat'")

    op.drop_index("ix_chat_messages_workspace_conversation_created", table_name="chat_messages")
    op.drop_table("chat_messages")
    op.drop_index(
        "ix_chat_conversations_workspace_account_last_message",
        table_name="chat_conversations",
    )
    op.drop_table("chat_conversations")
    op.drop_index(
        "ix_chat_channel_account_branches_workspace_branch",
        table_name="chat_channel_account_branches",
    )
    op.drop_table("chat_channel_account_branches")
    op.drop_index("ix_chat_channel_accounts_workspace_channel", table_name="chat_channel_accounts")
    op.drop_table("chat_channel_accounts")
