import {
    S3Client,
    PutObjectCommand,
    DeleteObjectCommand,
  } from "@aws-sdk/client-s3";
  import config from "../config/appconfig.js";
  
  const s3 = new S3Client({
    region: config.s3.region,
    credentials: {
      accessKeyId: config.s3.accessKeyId,
      secretAccessKey: config.s3.secretAccessKey,
    },
  });
  
  export const uploadFileToS3 = async (folderName, file) => {
    // const fileKey = `${folderName}/${Date.now()}-${folderName}`;
    const fileExtension = file.originalname.split('.').pop();
    const fileKey = `${folderName}/${Date.now()}.${fileExtension}`;

    const params = {
      Bucket: config.s3.bucketName,
      Key: fileKey,
      Body: file.buffer,
      ContentType: file.mimetype,
    };
  
    await s3.send(new PutObjectCommand(params));
    return `https://${config.s3.bucketName}.s3.${config.s3.region}.amazonaws.com/${fileKey}`;
  };
  
  export const deleteFileFromS3 = async (fileUrl) => {
    if (!fileUrl) return;
  
    const urlParts = fileUrl.split("/");
    const fileKey = urlParts.slice(3).join("/");
  
    const params = {
      Bucket: config.s3.bucketName,
      Key: fileKey,
    };
  
    await s3.send(new DeleteObjectCommand(params));
  };
  