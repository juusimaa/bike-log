using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BikeLog.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class ComponentGroupsWeight : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_Installation_Position",
                table: "Installations");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Component_Type",
                table: "Components");

            migrationBuilder.AddColumn<int>(
                name: "WeightGrams",
                table: "Components",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "FrameWeightGrams",
                table: "Bikes",
                type: "integer",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "PositionExemptions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    BikeId = table.Column<Guid>(type: "uuid", nullable: false),
                    Position = table.Column<string>(type: "text", nullable: false),
                    Reason = table.Column<string>(type: "text", nullable: false),
                    StartUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    EndUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    OwnerId = table.Column<Guid>(type: "uuid", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PositionExemptions", x => x.Id);
                    table.UniqueConstraint("AK_PositionExemptions_OwnerId_Id", x => new { x.OwnerId, x.Id });
                    table.CheckConstraint("CK_PositionExemption_Interval", "\"EndUtc\" IS NULL OR \"EndUtc\" > \"StartUtc\"");
                    table.CheckConstraint("CK_PositionExemption_Reason", "(\"Position\", \"Reason\") IN (('FrontDerailleur', 'NoneFitted'), ('FrontInnerTube', 'Tubeless'), ('RearInnerTube', 'Tubeless'))");
                    table.ForeignKey(
                        name: "FK_PositionExemptions_Bikes_OwnerId_BikeId",
                        columns: x => new { x.OwnerId, x.BikeId },
                        principalTable: "Bikes",
                        principalColumns: new[] { "OwnerId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.AddCheckConstraint(
                name: "CK_Installation_Position",
                table: "Installations",
                sql: "\"Position\" IN ('Fork', 'BottomBracket', 'Handlebar', 'HandlebarTape', 'Saddle', 'Seatpost', 'Pedals', 'FrontThroughAxle', 'RearThroughAxle', 'FrontDerailleur', 'RearDerailleur', 'Shifters', 'Cassette', 'Chain', 'FrontBrake', 'RearBrake', 'FrontBrakeLever', 'RearBrakeLever', 'Crankset', 'FrontRim', 'RearRim', 'FrontTyre', 'RearTyre', 'FrontDiscRotor', 'RearDiscRotor', 'FrontInnerTube', 'RearInnerTube')");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Component_Type",
                table: "Components",
                sql: "\"Type\" IN ('Fork', 'BottomBracket', 'Handlebar', 'HandlebarTape', 'Saddle', 'Seatpost', 'Pedals', 'ThroughAxle', 'FrontDerailleur', 'RearDerailleur', 'Shifters', 'Cassette', 'Chain', 'Brake', 'BrakeLever', 'Crankset', 'Rim', 'Tyre', 'DiscRotor', 'InnerTube')");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Component_Weight",
                table: "Components",
                sql: "\"WeightGrams\" IS NULL OR \"WeightGrams\" BETWEEN 1 AND 20000");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Bike_FrameWeight",
                table: "Bikes",
                sql: "\"FrameWeightGrams\" IS NULL OR \"FrameWeightGrams\" BETWEEN 1 AND 20000");

            migrationBuilder.CreateIndex(
                name: "IX_PositionExemptions_OwnerId",
                table: "PositionExemptions",
                column: "OwnerId");

            migrationBuilder.CreateIndex(
                name: "IX_PositionExemptions_OwnerId_BikeId_Position_StartUtc",
                table: "PositionExemptions",
                columns: new[] { "OwnerId", "BikeId", "Position", "StartUtc" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "PositionExemptions");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Installation_Position",
                table: "Installations");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Component_Type",
                table: "Components");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Component_Weight",
                table: "Components");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Bike_FrameWeight",
                table: "Bikes");

            migrationBuilder.DropColumn(
                name: "WeightGrams",
                table: "Components");

            migrationBuilder.DropColumn(
                name: "FrameWeightGrams",
                table: "Bikes");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Installation_Position",
                table: "Installations",
                sql: "\"Position\" IN ('Chain', 'Cassette', 'FrontTyre', 'RearTyre')");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Component_Type",
                table: "Components",
                sql: "\"Type\" IN ('Chain', 'Cassette', 'Tyre')");
        }
    }
}
