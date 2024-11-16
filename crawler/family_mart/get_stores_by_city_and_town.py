import json
import re

import aiohttp
import pydantic

from family_mart.types import FamilyMartService


class Store(pydantic.BaseModel):
    store_name: str = pydantic.Field(validation_alias="NAME", description="門市名稱")
    longitude: float = pydantic.Field(validation_alias="px", description="經度")
    latitude: float = pydantic.Field(validation_alias="py", description="緯度")
    address: str = pydantic.Field(validation_alias="addr", description="地址")
    store_id: str = pydantic.Field(validation_alias="oldpkey", description="門市編號")
    post: str = pydantic.Field(validation_alias="post", description="郵遞區號")
    road: str = pydantic.Field(validation_alias="road", description="道路名稱")
    family_mart_services: str = pydantic.Field(
        validation_alias="all", description="全家便利商店提供服務"
    )

    def get_services(self) -> list[FamilyMartService]:
        """
        get services 取得全家便利商店提供服務
        """
        return [
            FamilyMartService.from_str(s) for s in self.family_mart_services.split(",")
        ]


async def get_stores_by_city_and_town(
    session: aiohttp.ClientSession, key: str, city: str, town: str
) -> list[Store]:
    """
    get stores by city and town 透過行政區取得門市資訊
    """
    async with session.get(
        "https://api.map.com.tw/net/familyShop.aspx",
        headers={
            "Referer": "https://www.family.com.tw/",
        },
        params={
            "searchType": "ShopList",
            "type": "",
            "fun": "showStoreList",
            "key": key,
            "city": city,
            "area": town,
            "road": "",
        },
    ) as response:
        response_txt = await response.text()

        response_txt = re.sub(r"\s+", " ", response_txt).strip()
        matches = re.findall(r"\((.*?)\)", response_txt, re.DOTALL)
        response_json = json.loads(matches[0])

        return pydantic.TypeAdapter(list[Store]).validate_python(response_json)
