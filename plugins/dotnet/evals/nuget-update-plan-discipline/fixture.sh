#!/usr/bin/env bash
set -euo pipefail
mkdir -p src/App
cat > src/App/App.csproj <<'XML'
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
    <Nullable>enable</Nullable>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="Newtonsoft.Json" Version="12.0.1" />
    <PackageReference Include="Serilog" Version="3.1.1" />
    <PackageReference Include="xunit" Version="2.6.0" />
  </ItemGroup>
</Project>
XML
