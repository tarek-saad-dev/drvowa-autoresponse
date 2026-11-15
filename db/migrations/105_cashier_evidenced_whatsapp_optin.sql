-- Extend the narrowly-scoped WhatsApp marketing permission provenance for
-- explicit customer confirmation recorded at Cashier registration.
-- NEVER infer permission from an existing ERP phone or past invoice.
-- Customer STOP/opt-out table and all existing permission records stay intact.
IF OBJECT_ID(N'dbo.TblWhatsAppCampaignPermission', N'U') IS NOT NULL
BEGIN
  IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE parent_object_id = OBJECT_ID(N'dbo.TblWhatsAppCampaignPermission')
      AND name = N'CK_WACampaignPermission_Source'
  )
  BEGIN
    ALTER TABLE dbo.TblWhatsAppCampaignPermission
      DROP CONSTRAINT CK_WACampaignPermission_Source;
  END;
  ALTER TABLE dbo.TblWhatsAppCampaignPermission
    ADD CONSTRAINT CK_WACampaignPermission_Source
      CHECK (Source IN (N'EXPLICIT_INBOUND', N'EXPLICIT_POS_REGISTRATION'));
END;
GO
