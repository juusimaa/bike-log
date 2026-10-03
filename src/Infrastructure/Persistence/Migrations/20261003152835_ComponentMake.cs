using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BikeLog.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class ComponentMake : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Make",
                table: "Components",
                type: "text",
                nullable: false,
                defaultValue: "");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Make",
                table: "Components");
        }
    }
}
