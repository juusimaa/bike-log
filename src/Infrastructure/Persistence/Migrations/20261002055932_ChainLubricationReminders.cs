using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BikeLog.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class ChainLubricationReminders : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "TaskKey",
                table: "MaintenanceRecords",
                type: "text",
                nullable: true);

            migrationBuilder.Sql("""
                UPDATE "MaintenanceRecords" AS m
                SET "TaskKey" = 'chain-lubrication'
                FROM "Components" AS c
                WHERE m."Task" = 'Lubricate chain'
                  AND m."ComponentId" = c."Id"
                  AND m."OwnerId" = c."OwnerId"
                  AND c."Type" = 'Chain';
                """);

            migrationBuilder.CreateTable(
                name: "ChainLubricationRules",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    BikeId = table.Column<Guid>(type: "uuid", nullable: false),
                    Enabled = table.Column<bool>(type: "boolean", nullable: false),
                    Method = table.Column<string>(type: "text", nullable: true),
                    OilThresholdMetres = table.Column<long>(type: "bigint", nullable: true),
                    WaxThresholdMetres = table.Column<long>(type: "bigint", nullable: true),
                    OwnerId = table.Column<Guid>(type: "uuid", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ChainLubricationRules", x => x.Id);
                    table.UniqueConstraint("AK_ChainLubricationRules_OwnerId_Id", x => new { x.OwnerId, x.Id });
                    table.CheckConstraint("CK_Reminder_Enabled", "NOT \"Enabled\" OR (\"Method\" IS NOT NULL AND \"OilThresholdMetres\" IS NOT NULL AND \"WaxThresholdMetres\" IS NOT NULL)");
                    table.CheckConstraint("CK_Reminder_Method", "\"Method\" IS NULL OR \"Method\" IN ('Oil','Wax')");
                    table.CheckConstraint("CK_Reminder_Thresholds", "(\"OilThresholdMetres\" IS NULL OR \"OilThresholdMetres\" BETWEEN 1000 AND 10000000) AND (\"WaxThresholdMetres\" IS NULL OR \"WaxThresholdMetres\" BETWEEN 1000 AND 10000000)");
                    table.ForeignKey(
                        name: "FK_ChainLubricationRules_Bikes_OwnerId_BikeId",
                        columns: x => new { x.OwnerId, x.BikeId },
                        principalTable: "Bikes",
                        principalColumns: new[] { "OwnerId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ChainLubricationRules_OwnerId",
                table: "ChainLubricationRules",
                column: "OwnerId");

            migrationBuilder.CreateIndex(
                name: "IX_ChainLubricationRules_OwnerId_BikeId",
                table: "ChainLubricationRules",
                columns: new[] { "OwnerId", "BikeId" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ChainLubricationRules");

            migrationBuilder.DropColumn(
                name: "TaskKey",
                table: "MaintenanceRecords");
        }
    }
}
