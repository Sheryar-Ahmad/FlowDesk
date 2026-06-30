"""Cache extension point.

Current launch builds use in-process caches inside the services that need them.
A shared cache manager can be introduced here when Redis or another external
cache becomes part of the production architecture.
"""

__all__: list[str] = []
