import axios from "axios";

export const downloadVideoToBuffer = async (videoUrl) => {
  const res = await axios.get(videoUrl, {
    responseType: "arraybuffer",
  });
  return Buffer.from(res.data, "binary");
};