from pydantic import BaseModel

from .brand import Brand


class Store(BaseModel):
    id: str
    name: str
    address: str
    latitude: float
    longitude: float
    distance: float | None = None
    brand: Brand
