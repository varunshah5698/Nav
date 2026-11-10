"""Operator CLI.

    PYTHONPATH=backend .venv/bin/python -m app.cli create-user \\
        --email agent@example.com --role agent

Run from the repository root with the backend virtualenv active.
"""

from __future__ import annotations

import argparse
import getpass
import sys

from .core.paths import REPO_ROOT  # noqa: F401  (sys.path side effect)
from .db.base import session_scope
from .db.init import initialize
from .models import Role, User
from .services.audit import append, verify_chain

VALID_ROLES = [r.value for r in Role]


def _create_user(args: argparse.Namespace) -> int:
    from .core.security import hash_password

    password = args.password or getpass.getpass("Password: ")
    if len(password) < 10:
        print("error: password must be at least 10 characters", file=sys.stderr)
        return 2
    with session_scope() as session:
        if session.query(User).filter(User.email == args.email.lower()).first():
            print("error: a user with that email already exists", file=sys.stderr)
            return 2
        user = User(
            tenant_id=args.tenant,
            email=args.email.strip().lower(),
            password_hash=hash_password(password),
            full_name=args.name,
            role=Role(args.role).value,
        )
        session.add(user)
        session.flush()
        append(
            session,
            event="user.created",
            actor_role="system",
            payload={
                "user_id": user.id,
                "email": user.email,
                "role": user.role,
                "tenant_id": user.tenant_id,
                "via": "operator_cli",
            },
        )
        print(f"created {user.email} ({user.role}) in tenant {user.tenant_id}")
    return 0


def _init(_args: argparse.Namespace) -> int:
    initialize()
    print("schema initialized and system records seeded")
    return 0


def _list_users(_args: argparse.Namespace) -> int:
    with session_scope() as session:
        for user in session.query(User).order_by(User.created_at).all():
            print(
                f"{user.email:40s} {user.role:12s} {user.tenant_id:20s} "
                f"{'active' if user.is_active else 'disabled'}"
            )
    return 0


def _reset_password(args: argparse.Namespace) -> int:
    from .core.security import hash_password

    password = args.password or getpass.getpass("New password: ")
    with session_scope() as session:
        user = session.query(User).filter(User.email == args.email.lower()).first()
        if user is None:
            print("error: user not found", file=sys.stderr)
            return 2
        user.password_hash = hash_password(password)
        append(
            session,
            event="user.password_reset",
            actor_role="system",
            payload={
                "user_id": user.id,
                "email": user.email,
                "via": "operator_cli",
            },
        )
        print(f"password updated for {user.email}")
    return 0


def _verify_audit(_args: argparse.Namespace) -> int:
    with session_scope() as session:
        result = verify_chain(session)
    print(result)
    return 0 if result["valid"] else 1


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="voxsafe")
    sub = parser.add_subparsers(dest="command", required=True)

    init = sub.add_parser("init", help="create schema and seed system records")
    init.set_defaults(func=_init)

    create = sub.add_parser("create-user")
    create.add_argument("--email", required=True)
    create.add_argument("--name", default="VoxSafe User")
    create.add_argument("--role", choices=VALID_ROLES, default="agent")
    create.add_argument("--tenant", default="voxsafe-default")
    create.add_argument("--password")
    create.set_defaults(func=_create_user)

    listing = sub.add_parser("list-users")
    listing.set_defaults(func=_list_users)

    reset = sub.add_parser("reset-password")
    reset.add_argument("--email", required=True)
    reset.add_argument("--password")
    reset.set_defaults(func=_reset_password)

    verify = sub.add_parser("verify-audit")
    verify.set_defaults(func=_verify_audit)

    args = parser.parse_args(argv)
    return int(args.func(args) or 0)


if __name__ == "__main__":
    raise SystemExit(main())
