"""
Django views for the Tower of Hanoi game.

* ``index``       — renders the single-page game interface.
* ``solve_view``  — AJAX endpoint that runs the A*/BFS solver
                     and returns the optimal move list as JSON.
"""

import json
import traceback

from django.http import JsonResponse
from django.shortcuts import render
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST

from .solver import solve


def index(request):
    """Render the main game interface."""
    return render(request, 'game/game.html')


@csrf_exempt
@require_POST
def solve_view(request):
    """
    Accept a board state + target colours via POST, run the solver,
    and return the optimal move sequence as JSON.

    Request body (JSON)::

        {
            "pegs": [[{"size": int, "color": str}, ...], ...],
            "target_colors": [str, ...],
            "algorithm": "astar" | "bfs"
        }

    Response (JSON)::

        {
            "error": str | null,
            "moves": [{"source": int, "dest": int}, ...] | null
        }
    """
    try:
        data = json.loads(request.body)
        result = solve(
            pegs_data=data.get('pegs', [[], [], []]),
            target_colors=data.get('target_colors', []),
            algorithm=data.get('algorithm', 'astar'),
        )
        return JsonResponse(result)
    except json.JSONDecodeError:
        return JsonResponse(
            {'error': 'Invalid JSON payload.', 'moves': None},
            status=400,
        )
    except Exception:
        return JsonResponse(
            {'error': f'Internal server error:\n{traceback.format_exc()}', 'moves': None},
            status=500,
        )
