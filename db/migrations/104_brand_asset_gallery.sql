-- Brand asset gallery. Uploads are unpublished until approved by SUPER_ADMIN.
-- Binary storage is durable across VPS deploys and deploy-container replacements.
IF OBJECT_ID(N'dbo.TblBrandAsset', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.TblBrandAsset (
    AssetID UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_TblBrandAsset PRIMARY KEY,
    Variant NVARCHAR(32) NOT NULL,
    OriginalName NVARCHAR(180) NOT NULL,
    MimeType NVARCHAR(32) NOT NULL,
    FileSizeBytes INT NOT NULL,
    ImageBytes VARBINARY(MAX) NOT NULL,
    IsActive BIT NOT NULL CONSTRAINT DF_TblBrandAsset_IsActive DEFAULT (0),
    UploadedByUserID UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.TblUser(UserID),
    UploadedAtUtc DATETIME2(3) NOT NULL CONSTRAINT DF_TblBrandAsset_UploadedAt DEFAULT SYSUTCDATETIME(),
    ActivatedAtUtc DATETIME2(3) NULL,
    CONSTRAINT CK_TblBrandAsset_Variant CHECK (Variant IN
      (N'primary-dark', N'primary-light', N'compact', N'stacked', N'icon')),
    CONSTRAINT CK_TblBrandAsset_Mime CHECK (MimeType IN (N'image/png',N'image/webp',N'image/jpeg')),
    CONSTRAINT CK_TblBrandAsset_Bytes CHECK (FileSizeBytes BETWEEN 1 AND 2097152),
    CONSTRAINT CK_TblBrandAsset_Activation CHECK (IsActive = 0 OR ActivatedAtUtc IS NOT NULL)
  );
  CREATE UNIQUE INDEX UX_TblBrandAsset_Active ON dbo.TblBrandAsset(Variant) WHERE IsActive = 1;
  CREATE INDEX IX_TblBrandAsset_History ON dbo.TblBrandAsset(Variant, UploadedAtUtc DESC);
END;
