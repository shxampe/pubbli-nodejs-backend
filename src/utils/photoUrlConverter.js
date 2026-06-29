import config from "../config/appconfig.js";

export function photoUrlConverter(photoUrl) {
  return photoUrl.includes("avatar.png")
    ? `${config.app.base_url}${photoUrl}`
    : photoUrl;
}
