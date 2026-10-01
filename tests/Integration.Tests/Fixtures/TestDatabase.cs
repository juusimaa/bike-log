using BikeLog.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace BikeLog.Integration.Tests.Fixtures;

public static class TestDatabase
{
    public static BikeLogDbContext Open(string connection) =>
        new(new DbContextOptionsBuilder<BikeLogDbContext>().UseNpgsql(connection).Options);
}
