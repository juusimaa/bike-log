using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BikeLog.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class BikeMetadataAndRideNames : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Name",
                table: "Rides",
                type: "text",
                nullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "Name",
                table: "Bikes",
                type: "text",
                nullable: true,
                oldClrType: typeof(string),
                oldType: "text");

            migrationBuilder.AddColumn<string>(
                name: "Color",
                table: "Bikes",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Kind",
                table: "Bikes",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Make",
                table: "Bikes",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Model",
                table: "Bikes",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "Year",
                table: "Bikes",
                type: "integer",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Name",
                table: "Rides");

            migrationBuilder.DropColumn(
                name: "Color",
                table: "Bikes");

            migrationBuilder.DropColumn(
                name: "Kind",
                table: "Bikes");

            migrationBuilder.DropColumn(
                name: "Make",
                table: "Bikes");

            migrationBuilder.DropColumn(
                name: "Model",
                table: "Bikes");

            migrationBuilder.DropColumn(
                name: "Year",
                table: "Bikes");

            migrationBuilder.AlterColumn<string>(
                name: "Name",
                table: "Bikes",
                type: "text",
                nullable: false,
                defaultValue: "",
                oldClrType: typeof(string),
                oldType: "text",
                oldNullable: true);
        }
    }
}
