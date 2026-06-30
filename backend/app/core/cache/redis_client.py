"""Redis extension point.

FlowDesk does not require Redis for the current free-tier deployment. Keep this
module import-safe so a managed Redis client can be added later without changing
package layout.
"""

__all__: list[str] = []
