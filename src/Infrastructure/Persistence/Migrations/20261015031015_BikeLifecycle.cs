using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BikeLog.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class BikeLifecycle : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "DeletedUtc",
                table: "Bikes",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Status",
                table: "Bikes",
                type: "text",
                nullable: false,
                defaultValue: "Active");

            migrationBuilder.CreateIndex(
                name: "IX_Rides_OwnerId_StartUtc_Id",
                table: "Rides",
                columns: new[] { "OwnerId", "StartUtc", "Id" });

            migrationBuilder.AddCheckConstraint(
                name: "CK_Bike_Status",
                table: "Bikes",
                sql: "\"Status\" IN ('Active', 'Retired')");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Rides_OwnerId_StartUtc_Id",
                table: "Rides");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Bike_Status",
                table: "Bikes");

            migrationBuilder.DropColumn(
                name: "DeletedUtc",
                table: "Bikes");

            migrationBuilder.DropColumn(
                name: "Status",
                table: "Bikes");
        }
    }
}
