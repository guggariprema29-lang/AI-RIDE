import asyncio
import json
from typing import Dict, Set
from fastapi import WebSocket

class ConnectionManager:
    def __init__(self):
        # Maps user_id -> Set of active WebSocket connections
        self.active_connections: Dict[int, Set[WebSocket]] = {}

    async def connect(self, user_id: int, websocket: WebSocket):
        await websocket.accept()
        if user_id not in self.active_connections:
            self.active_connections[user_id] = set()
        self.active_connections[user_id].add(websocket)
        print(f"[WebSocket] User {user_id} connected. Total user connections: {len(self.active_connections[user_id])}")

    def disconnect(self, user_id: int, websocket: WebSocket):
        if user_id in self.active_connections:
            self.active_connections[user_id].discard(websocket)
            if not self.active_connections[user_id]:
                del self.active_connections[user_id]
        print(f"[WebSocket] User {user_id} disconnected.")

    async def send_personal_message(self, message: dict, websocket: WebSocket):
        try:
            await websocket.send_json(message)
        except Exception as e:
            print(f"[WebSocket] Error sending message: {e}")

    async def broadcast_to_user(self, user_id: int, message: dict):
        if user_id in self.active_connections:
            connections = list(self.active_connections[user_id])
            for websocket in connections:
                try:
                    await websocket.send_json(message)
                except Exception as e:
                    print(f"[WebSocket] Failed to send to user {user_id}: {e}")

manager = ConnectionManager()
