using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BikeLog.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class IndividualComponentTypes : Migration
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

            migrationBuilder.AddCheckConstraint(
                name: "CK_Installation_Position",
                table: "Installations",
                sql: "\"Position\" IN ('Chain', 'Cassette', 'FrontTyre', 'RearTyre')");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Component_Type",
                table: "Components",
                sql: "\"Type\" IN ('Chain', 'Cassette', 'Tyre')");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_Installation_Position",
                table: "Installations");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Component_Type",
                table: "Components");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Installation_Position",
                table: "Installations",
                sql: "\"Position\" = 'Chain'");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Component_Type",
                table: "Components",
                sql: "\"Type\" = 'Chain'");
        }
    }
}
