using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BikeLog.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class InitialUsageEstimates : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<long>(
                name: "InitialUsageEstimateMetres",
                table: "Components",
                type: "bigint",
                nullable: false,
                defaultValue: 0L);

            migrationBuilder.AddCheckConstraint(
                name: "CK_Component_InitialUsageEstimate",
                table: "Components",
                sql: "\"InitialUsageEstimateMetres\" >= 0");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_Component_InitialUsageEstimate",
                table: "Components");

            migrationBuilder.DropColumn(
                name: "InitialUsageEstimateMetres",
                table: "Components");
        }
    }
}
